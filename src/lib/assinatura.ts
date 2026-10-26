// Decide se um código pode usar o Cold hoje, e com que limite.
// Ordem: 1) o teu código ilimitado; 2) assinaturas na Supabase; 3) códigos antigos das variáveis (CODIGOS_ACESSO).
import { diasEntre, hojeEmLuanda, limiteDiario, normalizarCodigo, somarDias, tipoDoCodigo } from "./acesso";
import { atualizarAcesso, obterAcesso, temSupabase } from "./acessos";
import { limiteDoPlano, planoPorId } from "./planos";

export type Resolucao =
  | { ok: true; tipo: "ilimitado" }
  | {
      ok: true;
      tipo: "normal";
      limite: number;
      origem: "env" | "assinatura";
      plano?: string;
      validoAte?: string;
      diasRestantes?: number;
      nome?: string;
    }
  | { ok: false; motivo: "invalido" }
  | { ok: false; motivo: "inativo" }
  | { ok: false; motivo: "expirado"; validoAte: string; plano: string };

// Lança erro se a Supabase falhar (quem chama responde "não consegui verificar", nunca "tens trocas").
export async function resolverAcesso(codigoBruto: unknown): Promise<Resolucao> {
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigo) return { ok: false, motivo: "invalido" };

  const envTipo = tipoDoCodigo(codigo);
  if (envTipo === "ilimitado") return { ok: true, tipo: "ilimitado" };

  if (temSupabase()) {
    const a = await obterAcesso(codigo);
    if (a) {
      if (!a.ativo) return { ok: false, motivo: "inativo" };
      const plano = planoPorId(a.plano);
      if (!plano && !(a.limite_diario && a.limite_diario > 0)) return { ok: false, motivo: "invalido" };
      const hoje = hojeEmLuanda();

      // Teste grátis: os 7 dias contam a partir do 1.º uso.
      if (plano && plano.id === "teste" && !a.inicio) {
        a.inicio = hoje;
        a.valido_ate = somarDias(hoje, plano.dias - 1);
        await atualizarAcesso(codigo, { inicio: a.inicio, valido_ate: a.valido_ate });
      }

      if (a.valido_ate && hoje > a.valido_ate) {
        return { ok: false, motivo: "expirado", validoAte: a.valido_ate, plano: plano?.nome ?? a.plano };
      }

      const limite = plano
        ? limiteDoPlano(plano, a.limite_diario, a.inicio, hoje)
        : (a.limite_diario as number);
      return {
        ok: true,
        tipo: "normal",
        limite,
        origem: "assinatura",
        plano: plano?.nome ?? a.plano,
        validoAte: a.valido_ate ?? undefined,
        diasRestantes: a.valido_ate ? diasEntre(hoje, a.valido_ate) + 1 : undefined,
        nome: a.nome || undefined,
      };
    }
  }

  if (envTipo === "normal") {
    return { ok: true, tipo: "normal", limite: limiteDiario(codigo), origem: "env" };
  }
  return { ok: false, motivo: "invalido" };
}

