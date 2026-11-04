import { NextResponse } from "next/server";
import { hojeEmLuanda } from "../../../lib/acesso";
import { listarAcessosDoUsuario, temSupabase } from "../../../lib/acessos";
import {
  atualizarPedido,
  criarPedido,
  gerarRef,
  listarPedidosDoUsuario,
  obterPedido,
  type Pedido,
} from "../../../lib/pedidos";
import { PLANOS, VALOR_MINIMO_PEDIDO_KZ, formatarKz, planoPorId, validarPersonalizado } from "../../../lib/planos";
import { sessaoInvalida } from "../../../lib/respostas";
import { contasAtivas, tokenDoPedido, verificarToken, type Usuario } from "../../../lib/sessao";

export const dynamic = "force-dynamic";

const MAX_PENDENTES = 3;

async function quem(req: Request): Promise<Usuario | NextResponse> {
  if (!contasAtivas() || !temSupabase()) {
    return NextResponse.json({ error: "As contas ainda não estão ligadas." }, { status: 503 });
  }
  const token = tokenDoPedido(req);
  if (!token) return sessaoInvalida();
  try {
    return (await verificarToken(token)) ?? sessaoInvalida();
  } catch {
    return NextResponse.json({ error: "Não consegui verificar a tua sessão." }, { status: 500 });
  }
}

// A pessoa já tem um plano a correr (ou agendado)? Se sim, o pedido novo pode ir "depois" ou "agora".
async function temPlano(userId: string): Promise<boolean> {
  const hoje = hojeEmLuanda();
  return (await listarAcessosDoUsuario(userId)).some((a) => a.ativo && a.valido_ate && a.valido_ate >= hoje);
}

export async function GET(req: Request) {
  const u = await quem(req);
  if (u instanceof NextResponse) return u;
  try {
    const [pedidos, plano] = await Promise.all([listarPedidosDoUsuario(u.id), temPlano(u.id)]);
    return NextResponse.json({
      pedidos: pedidos.map((p) => ({
        ref: p.ref, tipo: p.tipo, trocas_dia: p.trocas_dia, dias: p.dias, preco_kz: p.preco_kz,
        quando: p.quando, estado: p.estado, criado_em: p.criado_em,
      })),
      temPlano: plano,
    });
  } catch {
    return NextResponse.json({ error: "Não consegui ler os teus pedidos." }, { status: 500 });
  }
}

// POST {tipo, trocas_dia?, dias?, quando?}  -> cria um pedido (o preço é SEMPRE calculado aqui)
// POST {acao:"cancelar", ref}               -> a pessoa cancela um pedido seu ainda pendente
export async function POST(req: Request) {
  const u = await quem(req);
  if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  try {
    if (b.acao === "cancelar") {
      const p = typeof b.ref === "string" ? await obterPedido(b.ref) : null;
      if (!p || p.user_id !== u.id) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
      if (p.estado !== "pendente") return NextResponse.json({ error: "Este pedido já não está pendente." }, { status: 409 });
      await atualizarPedido(p.ref, { estado: "cancelado" });
      return NextResponse.json({ ok: true });
    }

    let trocas: number;
    let dias: number;
    let preco: number;
    const plano = planoPorId(b.tipo);
    if (b.tipo === "personalizado") {
      // limites de trocas e dias, e valor mínimo (as mesmas regras da página, mas aqui ninguém as contorna)
      const v = validarPersonalizado(b.trocas_dia, b.dias);
      if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
      trocas = v.trocas;
      dias = v.dias;
      preco = v.preco;
    } else if (plano && plano.publico && plano.precoKz > 0 && PLANOS.includes(plano)) {
      trocas = plano.trocasPorDia;
      dias = plano.dias;
      preco = plano.precoKz;
    } else {
      return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
    }
    if (preco < VALOR_MINIMO_PEDIDO_KZ) {
      return NextResponse.json({ error: `O valor mínimo por pedido é ${formatarKz(VALOR_MINIMO_PEDIDO_KZ)}.` }, { status: 400 });
    }

    const antigos = await listarPedidosDoUsuario(u.id);
    if (antigos.filter((p) => p.estado === "pendente").length >= MAX_PENDENTES) {
      return NextResponse.json(
        { error: `Já tens ${MAX_PENDENTES} pedidos por pagar. Paga ou cancela algum antes de pedires outro.` },
        { status: 409 }
      );
    }

    const emCurso = await temPlano(u.id);
    const quando: "agora" | "depois" = !emCurso ? "agora" : b.quando === "agora" ? "agora" : "depois";

    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const pedido: Pedido = {
        ref: gerarRef(),
        user_id: u.id,
        email: u.email,
        nome: u.nome,
        tipo: b.tipo as string,
        trocas_dia: trocas,
        dias,
        preco_kz: preco,
        quando,
        estado: "pendente",
        codigo: null,
      };
      if (await criarPedido(pedido)) {
        return NextResponse.json({ ok: true, ref: pedido.ref, preco_kz: preco, trocas_dia: trocas, dias, quando });
      }
    }
    return NextResponse.json({ error: "Não consegui criar o pedido. Tenta de novo." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Não consegui criar o pedido. Tenta de novo." }, { status: 500 });
  }
}
