import { NextResponse } from "next/server";
import { temSupabase } from "../../../lib/acessos";
import { apagarChat, guardarChat, idValido, listarMetas, obterChat, validarChat } from "../../../lib/chats";
import { sessaoInvalida } from "../../../lib/respostas";
import { contasAtivas, tokenDoPedido, verificarToken, type Usuario } from "../../../lib/sessao";

export const dynamic = "force-dynamic";

// Só deixa passar quem tem sessão válida; o utilizador vem SEMPRE do token (nunca do que o navegador diz).
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

// GET /api/chats          -> lista leve (id, título, data, apagado)
// GET /api/chats?id=...   -> um chat completo
export async function GET(req: Request) {
  const u = await quem(req);
  if (u instanceof NextResponse) return u;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id !== null) {
      if (!idValido(id)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
      const chat = await obterChat(u.id, id);
      return chat ? NextResponse.json({ chat }) : NextResponse.json({ error: "Chat não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ chats: await listarMetas(u.id) });
  } catch {
    return NextResponse.json({ error: "Não consegui ler os teus chats." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const u = await quem(req);
  if (u instanceof NextResponse) return u;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    if (b.acao === "guardar") {
      const chat = validarChat(b.chat);
      if (!chat) return NextResponse.json({ error: "Chat inválido ou demasiado grande." }, { status: 400 });
      const r = await guardarChat(u.id, chat);
      if (r === "demasiados") {
        return NextResponse.json({ error: "Tens chats a mais. Apaga alguns para guardares novos.", demasiados: true }, { status: 409 });
      }
      return NextResponse.json({ ok: true, resultado: r });
    }
    if (b.acao === "apagar") {
      if (!idValido(b.id)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
      const quando = typeof b.atualizado === "number" && Number.isFinite(b.atualizado) ? Math.trunc(b.atualizado) : Date.now();
      await apagarChat(u.id, b.id, quando);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Não consegui guardar. Tenta de novo." }, { status: 500 });
  }
}
