import { NextResponse } from "next/server";
import { diasEntre, hojeEmLuanda, normalizarCodigo, somarDias, tipoDoCodigo } from "../../../../lib/acesso";
import { emailCanonico, emailValido } from "../../../../lib/contacto";
import { contasAtivas } from "../../../../lib/sessao";
import {
  apagarAcesso,
  apagarPagamento,
  apagarTodosPagamentos,
  atualizarAcesso,
  criarAcesso,
  gerarCodigo,
  listarAcessos,
  listarAcessosDoUsuario,
  listarPagamentos,
  obterAcesso,
  procurarPorEmail,
  registarPagamento,
  temSupabase,
  type Acesso,
} from "../../../../lib/acessos";
import { atualizarPedido, listarPedidosPendentes, listarPedidosRecentes, obterPedido } from "../../../../lib/pedidos";
import { PLANOS, planoPorId } from "../../../../lib/planos";

export const dynamic = "force-dynamic";

function autorizado(req: Request): boolean {
  return tipoDoCodigo(req.headers.get("x-codigo")) === "ilimitado";
}

function estadoDe(a: Acesso, hoje: string): "ativo" | "expirado" | "desativado" | "por iniciar" | "agendado" {
  if (!a.ativo) return "desativado";
  if (a.inicio && a.plano !== "teste" && a.inicio > hoje) return "agendado";
  if (!a.valido_ate) return a.plano === "teste" ? "por iniciar" : "ativo";
  return hoje > a.valido_ate ? "expirado" : "ativo";
}

async function estadoGeral() {
  const hoje = hojeEmLuanda();
  const [acessos, pagamentos, pedidos, pedidosRecentes] = await Promise.all([
    listarAcessos(),
    listarPagamentos(),
    listarPedidosPendentes(),
    listarPedidosRecentes(),
  ]);
  return {
    hoje,
    planos: PLANOS,
    acessos: acessos.map((a) => ({
      ...a,
      estado: estadoDe(a, hoje),
      diasRestantes: a.valido_ate ? diasEntre(hoje, a.valido_ate) + 1 : null,
    })),
    receitaKz: pagamentos.reduce((s, p) => s + (p.valor_kz || 0), 0),
    pagamentos: pagamentos.length,
    listaPagamentos: pagamentos.slice(0, 50),
    pedidos, // pendentes (por confirmar)
    pedidosRecentes,
  };
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function inteiro(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if (!temSupabase()) {
    return NextResponse.json(
      { error: "As assinaturas precisam da Supabase (SUPABASE_URL e SUPABASE_SECRET_KEY)." },
      { status: 500 }
    );
  }
  try {
    return NextResponse.json(await estadoGeral());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if (!temSupabase()) {
    return NextResponse.json({ error: "As assinaturas precisam da Supabase." }, { status: 500 });
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const hoje = hojeEmLuanda();

  try {
    if (b.acao === "criar") {
      const plano = planoPorId(b.plano);
      if (!plano || plano.criavel === false) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
      const nome = texto(b.nome, 80);
      if (!nome) return NextResponse.json({ error: "Indica o nome da pessoa." }, { status: 400 });
      const dias = b.dias === undefined || b.dias === "" ? plano.dias : inteiro(b.dias, 1, 366);
      const valor = b.valorKz === undefined || b.valorKz === "" ? plano.precoKz : inteiro(b.valorKz, 0, 1_000_000);
      if (dias === null || valor === null) return NextResponse.json({ error: "Dias ou valor inválidos." }, { status: 400 });

      // Plano reservado a um email: quando a pessoa entrar com esse Google, o plano aparece sozinho.
      let email: string | null = null;
      let emailChave: string | null = null;
      if (typeof b.email === "string" && b.email.trim() !== "") {
        if (!emailValido(b.email)) return NextResponse.json({ error: "Email inválido." }, { status: 400 });
        if (!contasAtivas()) {
          return NextResponse.json(
            { error: "As contas Google ainda não estão ligadas (faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY)." },
            { status: 400 }
          );
        }
        email = b.email.trim().toLowerCase();
        emailChave = emailCanonico(email);
        const ja = await procurarPorEmail(emailChave);
        if (ja) {
          return NextResponse.json({ error: `Já existe um acesso para este email (${ja.codigo}). Usa «Renovar» nesse.` }, { status: 409 });
        }
      }

      const manual = typeof b.codigo === "string" && b.codigo.trim() !== "";
      let codigo = manual ? normalizarCodigo(b.codigo) : "";
      if (manual && !codigo) {
        return NextResponse.json({ error: "Código inválido (3 a 64 letras, números, - ou _)." }, { status: 400 });
      }
      if (manual && tipoDoCodigo(codigo)) {
        return NextResponse.json({ error: "Esse código já existe nas variáveis da Vercel." }, { status: 409 });
      }

      const teste = plano.id === "teste";
      for (let tentativa = 0; tentativa < 8; tentativa++) {
        if (!manual) {
          codigo = gerarCodigo();
          if (tipoDoCodigo(codigo)) continue;
        }
        const novo: Acesso = {
          codigo,
          nome,
          contacto: texto(b.contacto, 40),
          plano: plano.id,
          limite_diario: null,
          inicio: teste ? null : hoje, // o teste só começa no 1.º uso
          valido_ate: teste ? null : somarDias(hoje, dias - 1),
          ativo: true,
          notas: texto(b.notas, 200),
          ...(email ? { email, email_chave: emailChave } : {}),
        };
        const criado = await criarAcesso(novo);
        if (criado) {
          if (valor > 0) await registarPagamento({ codigo, plano: plano.id, valor_kz: valor, dias });
          return NextResponse.json({ ok: true, codigo, acesso: novo, ...(await estadoGeral()) });
        }
        if (manual) return NextResponse.json({ error: "Esse código já existe." }, { status: 409 });
      }
      return NextResponse.json({ error: "Não consegui gerar um código único. Tenta de novo." }, { status: 500 });
    }

    // ----- pagamentos registados (para limpar testes) -----
    if (b.acao === "apagar-pagamento") {
      const id = inteiro(b.id, 1, Number.MAX_SAFE_INTEGER);
      if (id === null) return NextResponse.json({ error: "Pagamento inválido." }, { status: 400 });
      if ((await apagarPagamento(id)) === 0) return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
      return NextResponse.json({ ok: true, ...(await estadoGeral()) });
    }
    if (b.acao === "limpar-pagamentos") {
      const n = await apagarTodosPagamentos();
      return NextResponse.json({ ok: true, apagados: n, ...(await estadoGeral()) });
    }

    // ----- pedidos de plano feitos pelos alunos -----
    if (b.acao === "confirmar-pedido" || b.acao === "cancelar-pedido") {
      const p = typeof b.ref === "string" ? await obterPedido(b.ref.trim().toUpperCase()) : null;
      if (!p) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
      if (p.estado !== "pendente") return NextResponse.json({ error: "Este pedido já foi tratado." }, { status: 409 });
      if (b.acao === "cancelar-pedido") {
        await atualizarPedido(p.ref, { estado: "cancelado" });
        return NextResponse.json({ ok: true, ...(await estadoGeral()) });
      }
      const valor = b.valorKz === undefined || b.valorKz === "" ? p.preco_kz : inteiro(b.valorKz, 0, 1_000_000);
      if (valor === null) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });

      // "depois": começa no dia a seguir ao fim do que a pessoa já tem; "agora": começa hoje e convive com o resto (vale o melhor limite)
      let inicio = hoje;
      if (p.quando === "depois") {
        const fins = (await listarAcessosDoUsuario(p.user_id))
          .filter((x) => x.ativo && x.valido_ate && x.valido_ate >= hoje)
          .map((x) => x.valido_ate as string)
          .sort();
        if (fins.length > 0) inicio = somarDias(fins[fins.length - 1], 1);
      }
      const nomePlano = planoPorId(p.tipo)?.nome ?? p.tipo;
      for (let tentativa = 0; tentativa < 8; tentativa++) {
        const codigoNovo = gerarCodigo();
        if (tipoDoCodigo(codigoNovo)) continue;
        const novo: Acesso = {
          codigo: codigoNovo,
          nome: p.nome,
          contacto: p.email,
          plano: p.tipo,
          limite_diario: p.trocas_dia, // fica guardado: mesmo que mudes os planos, este pedido mantém o que foi pago
          inicio,
          valido_ate: somarDias(inicio, p.dias - 1),
          ativo: true,
          notas: `pedido:${p.ref}`,
          user_id: p.user_id,
        };
        if (await criarAcesso(novo)) {
          if (valor > 0) await registarPagamento({ codigo: codigoNovo, plano: p.tipo, valor_kz: valor, dias: p.dias });
          await atualizarPedido(p.ref, { estado: "confirmado", codigo: codigoNovo, confirmado_em: new Date().toISOString() });
          return NextResponse.json({
            ok: true,
            codigo: codigoNovo,
            confirmacao: { nome: p.nome, plano: nomePlano, trocas_dia: p.trocas_dia, inicio, valido_ate: novo.valido_ate },
            ...(await estadoGeral()),
          });
        }
      }
      return NextResponse.json({ error: "Não consegui ativar o plano. Tenta de novo." }, { status: 500 });
    }

    const codigo = normalizarCodigo(b.codigo);
    const a = codigo ? await obterAcesso(codigo) : null;
    if (!a) return NextResponse.json({ error: "Código não encontrado." }, { status: 404 });

    if (b.acao === "renovar") {
      const plano = planoPorId(b.plano ?? a.plano);
      if (!plano) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
      const dias = b.dias === undefined || b.dias === "" ? plano.dias : inteiro(b.dias, 1, 366);
      const valor = b.valorKz === undefined || b.valorKz === "" ? plano.precoKz : inteiro(b.valorKz, 0, 1_000_000);
      if (dias === null || valor === null) return NextResponse.json({ error: "Dias ou valor inválidos." }, { status: 400 });
      // Se ainda está válido, os dias somam-se ao fim; se já expirou, contam a partir de hoje.
      const aindaValido = a.valido_ate && a.valido_ate >= hoje && a.ativo;
      const comeco = aindaValido ? somarDias(a.valido_ate as string, 1) : hoje;
      const novoAte = somarDias(comeco, dias - 1);
      await atualizarAcesso(codigo, {
        plano: plano.id,
        inicio: aindaValido ? a.inicio ?? hoje : hoje,
        valido_ate: novoAte,
        ativo: true,
      });
      if (valor > 0) await registarPagamento({ codigo, plano: plano.id, valor_kz: valor, dias });
      return NextResponse.json({ ok: true, codigo, ...(await estadoGeral()) });
    }

    if (b.acao === "apagar") {
      if (a.ativo) {
        return NextResponse.json({ error: "Só podes apagar assinaturas desativadas. Desativa primeiro." }, { status: 409 });
      }
      // Os pagamentos registados ficam (o total recebido não muda); só desaparece o acesso.
      await apagarAcesso(codigo);
      return NextResponse.json({ ok: true, codigo, ...(await estadoGeral()) });
    }

    if (b.acao === "desativar" || b.acao === "reativar") {
      await atualizarAcesso(codigo, { ativo: b.acao === "reativar" });
      return NextResponse.json({ ok: true, codigo, ...(await estadoGeral()) });
    }

    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro." }, { status: 500 });
  }
}
