import { NextResponse } from "next/server";
import { tipoDoCodigo } from "../../../../lib/acesso";
import { criarAcesso, gerarCodigo, listarAcessosDoUsuario, temSupabase } from "../../../../lib/acessos";
import { sessaoInvalida } from "../../../../lib/respostas";
import { contasAtivas, tokenDoPedido, verificarToken } from "../../../../lib/sessao";
import { estadoTestes } from "../../../../lib/testes";

export const dynamic = "force-dynamic";

// Teste grátis de 7 dias para quem entrou com o Google (um por conta).
export async function POST(req: Request) {
  if (!contasAtivas() || !temSupabase()) {
    return NextResponse.json({ error: "As contas ainda não estão ligadas." }, { status: 503 });
  }
  const token = tokenDoPedido(req);
  if (!token) return sessaoInvalida();
  try {
    const u = await verificarToken(token);
    if (!u) return sessaoInvalida();

    if ((await listarAcessosDoUsuario(u.id)).length > 0) {
      return NextResponse.json({ error: "Esta conta já tem um plano ou já usou o teste." }, { status: 409 });
    }
    const st = await estadoTestes();
    if (!st.aberto) {
      return NextResponse.json(
        {
          error:
            st.motivo === "esgotado"
              ? "Os testes grátis de hoje já esgotaram. Volta amanhã ou vê as assinaturas."
              : "Os testes grátis estão fechados de momento. Vê as assinaturas.",
          fechado: true,
        },
        { status: st.motivo === "esgotado" ? 429 : 403 }
      );
    }
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const codigo = gerarCodigo();
      if (tipoDoCodigo(codigo)) continue;
      const criado = await criarAcesso({
        codigo,
        nome: u.nome,
        contacto: u.email,
        plano: "teste",
        limite_diario: null,
        inicio: null, // os 7 dias contam a partir do 1.º uso
        valido_ate: null,
        ativo: true,
        notas: "auto-teste",
        user_id: u.id,
      });
      if (criado) return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Não consegui criar o teu teste. Tenta de novo." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Não consegui criar o teu teste. Tenta de novo." }, { status: 500 });
  }
}
