// Decide se um pedido pode usar o Cold hoje, e com que limite.
// Quem pede: 1) uma conta Google (token) ou 2) um código.
// Para códigos: o teu código ilimitado; assinaturas na Supabase; códigos antigos das variáveis (CODIGOS_ACESSO).
import { diasEntre, hojeEmLuanda, limiteDiario, normalizarCodigo, somarDias, tipoDoCodigo } from "./acesso";
import {
  atualizarAcesso,
  listarAcessosDoUsuario,
  listarReservadosPorEmail,
  obterAcesso,
  temSupabase,
  vincularSeLivre,
  type Acesso,
} from "./acessos";
import { emailCanonico } from "./contacto";
import { limiteDoPlano, planoPorId } from "./planos";
import { contasAtivas, tokenDoPedido, verificarToken, type Usuario } from "./sessao";

export type Resolucao =
  | { ok: true; tipo: "ilimitado" }
  | {
      ok: true;
      tipo: "normal";
      codigo: string; // o código em cujo nome se conta o uso
      limite: number;
      origem: "env" | "assinatura";
      plano?: string;
      validoAte?: string;
      diasRestantes?: number;
      nome?: string;
    }
  | { ok: false; motivo: "invalido" }
  | { ok: false; motivo: "inativo" }
  | { ok: false; motivo: "ligado" } // o código já está ligado a uma conta: só se entra com o Google
  | { ok: false; motivo: "sem-plano" } // conta sem nenhum plano ainda
  | { ok: false; motivo: "agendado"; inicio: string; plano: string } // pago, mas só começa mais tarde
  | { ok: false; motivo: "expirado"; validoAte: string; plano: string };

// Regras de uma assinatura (ativa, validade, teste grátis, limite do dia).
async function avaliarAcesso(a: Acesso): Promise<Resolucao> {
  if (!a.ativo) return { ok: false, motivo: "inativo" };
  const plano = planoPorId(a.plano);
  if (!plano && !(a.limite_diario && a.limite_diario > 0)) return { ok: false, motivo: "invalido" };
  const hoje = hojeEmLuanda();

  // Teste grátis: os 7 dias contam a partir do 1.º uso.
  if (plano && plano.id === "teste" && !a.inicio) {
    a.inicio = hoje;
    a.valido_ate = somarDias(hoje, plano.dias - 1);
    await atualizarAcesso(a.codigo, { inicio: a.inicio, valido_ate: a.valido_ate });
  }

  if (a.inicio && hoje < a.inicio) {
    return { ok: false, motivo: "agendado", inicio: a.inicio, plano: plano?.nome ?? a.plano };
  }
  if (a.valido_ate && hoje > a.valido_ate) {
    return { ok: false, motivo: "expirado", validoAte: a.valido_ate, plano: plano?.nome ?? a.plano };
  }

  const limite = plano ? limiteDoPlano(plano, a.limite_diario, a.inicio, hoje) : (a.limite_diario as number);
  return {
    ok: true,
    tipo: "normal",
    codigo: a.codigo,
    limite,
    origem: "assinatura",
    plano: plano?.nome ?? a.plano,
    validoAte: a.valido_ate ?? undefined,
    diasRestantes: a.valido_ate ? diasEntre(hoje, a.valido_ate) + 1 : undefined,
    nome: a.nome || undefined,
  };
}

// Lança erro se a Supabase falhar (quem chama responde "não consegui verificar", nunca "tens trocas").
export async function resolverAcesso(codigoBruto: unknown): Promise<Resolucao> {
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigo) return { ok: false, motivo: "invalido" };

  const envTipo = tipoDoCodigo(codigo);
  if (envTipo === "ilimitado") return { ok: true, tipo: "ilimitado" };

  if (temSupabase()) {
    const a = await obterAcesso(codigo);
    if (a) {
      if (a.user_id) return { ok: false, motivo: "ligado" };
      if (a.email_chave) return { ok: false, motivo: "invalido" }; // reservado a um email: só se entra com esse Google
      return avaliarAcesso(a);
    }
  }

  if (envTipo === "normal") {
    return { ok: true, tipo: "normal", codigo, limite: limiteDiario(codigo), origem: "env" };
  }
  return { ok: false, motivo: "invalido" };
}

// Uma conta pode ter vários códigos ligados (ex.: teste e depois uma assinatura): vale o melhor que esteja válido.
// Se "reivindicar", também liga à conta os planos que o painel reservou para o email do Google (só com email verificado).
// Sem plano nenhum, procura sempre (é barato e é o caso de quem acabou de pagar).
export async function resolverConta(user: Usuario, reivindicar = true): Promise<Resolucao> {
  const lista = await listarAcessosDoUsuario(user.id);
  if (user.emailVerificado && user.email && (reivindicar || lista.length === 0)) {
    for (const a of await listarReservadosPorEmail(emailCanonico(user.email))) {
      if (await vincularSeLivre(a.codigo, user.id, {})) {
        a.user_id = user.id;
        lista.push(a);
      }
    }
  }
  if (lista.length === 0) return { ok: false, motivo: "sem-plano" };
  const avaliados: Resolucao[] = [];
  for (const a of lista) avaliados.push(await avaliarAcesso(a));

  const validos = avaliados.filter((r): r is Extract<Resolucao, { ok: true; tipo: "normal" }> => r.ok && r.tipo === "normal");
  if (validos.length > 0) {
    validos.sort((x, y) => y.limite - x.limite || (y.validoAte ?? "9999").localeCompare(x.validoAte ?? "9999"));
    return validos[0];
  }
  const agendados = avaliados.filter((r): r is Extract<Resolucao, { motivo: "agendado" }> => !r.ok && r.motivo === "agendado");
  if (agendados.length > 0) {
    agendados.sort((x, y) => x.inicio.localeCompare(y.inicio));
    return agendados[0];
  }
  const expirados = avaliados.filter((r): r is Extract<Resolucao, { motivo: "expirado" }> => !r.ok && r.motivo === "expirado");
  if (expirados.length > 0) {
    expirados.sort((x, y) => y.validoAte.localeCompare(x.validoAte));
    return expirados[0];
  }
  return { ok: false, motivo: "inativo" };
}

export type Pedido =
  | { tipo: "sessao-invalida" }
  | { tipo: "resolucao"; resolucao: Resolucao; usuario: Usuario | null };

export async function resolverPedido(
  req: Request,
  codigoBruto: unknown,
  opcoes: { reivindicar?: boolean } = {}
): Promise<Pedido> {
  const token = tokenDoPedido(req);
  if (token) {
    if (!contasAtivas() || !temSupabase()) return { tipo: "sessao-invalida" };
    const usuario = await verificarToken(token);
    if (!usuario) return { tipo: "sessao-invalida" };
    return { tipo: "resolucao", resolucao: await resolverConta(usuario, opcoes.reivindicar ?? false), usuario };
  }
  return { tipo: "resolucao", resolucao: await resolverAcesso(codigoBruto), usuario: null };
}
