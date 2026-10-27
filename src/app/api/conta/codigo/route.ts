import { NextResponse } from "next/server";
import { limiteDiario, normalizarCodigo, tipoDoCodigo } from "../../../../lib/acesso";
import { criarAcesso, obterAcesso, temSupabase, vincularSeLivre } from "../../../../lib/acessos";
import { sessaoInvalida } from "../../../../lib/respostas";
import { contasAtivas, tokenDoPedido, verificarToken } from "../../../../lib/sessao";

export const dynamic = "force-dynamic";

// Liga um código (do piloto, de um teste ou de uma assinatura) à conta Google de quem está com sessão.
export async function POST(req: Request) {
  if (!contasAtivas() || !temSupabase()) {
    return NextResponse.json({ error: "As contas ainda não estão ligadas." }, { status: 503 });
  }
  const token = tokenDoPedido(req);
  if (!token) return sessaoInvalida();
  let u;
  try {
    u = await verificarToken(token);
  } catch {
    return NextResponse.json({ error: "Não consegui verificar a tua sessão." }, { status: 500 });
  }
  if (!u) return sessaoInvalida();

  const b = (await req.json().catch(() => null)) as { codigo?: unknown } | null;
  const codigo = normalizarCodigo(b?.codigo);
  if (!codigo) return NextResponse.json({ error: "Escreve o teu código." }, { status: 400 });

  try {
    if (tipoDoCodigo(codigo) === "ilimitado") {
      return NextResponse.json({ error: "Este código não pode ser ligado a uma conta." }, { status: 400 });
    }

    const a = await obterAcesso(codigo);
    if (a) {
      if (a.user_id === u.id) return NextResponse.json({ ok: true, codigo });
      if (a.user_id) return NextResponse.json({ error: "Este código já está ligado a outra conta." }, { status: 409 });
      const ligado = await vincularSeLivre(codigo, u.id, { nome: a.nome || u.nome, contacto: a.contacto || u.email });
      if (!ligado) return NextResponse.json({ error: "Este código já está ligado a outra conta." }, { status: 409 });
      return NextResponse.json({ ok: true, codigo });
    }

    // Código antigo do piloto (nas variáveis da Vercel): passa a existir na Supabase, ligado a esta conta.
    if (tipoDoCodigo(codigo) === "normal") {
      const criado = await criarAcesso({
        codigo,
        nome: u.nome,
        contacto: u.email,
        plano: "piloto",
        limite_diario: limiteDiario(codigo),
        inicio: null,
        valido_ate: null,
        ativo: true,
        notas: "migrado-piloto",
        user_id: u.id,
      });
      if (!criado) return NextResponse.json({ error: "Este código já está ligado a outra conta." }, { status: 409 });
      return NextResponse.json({ ok: true, codigo });
    }

    await new Promise((res) => setTimeout(res, 600)); // trava tentativas rápidas de adivinhar
    return NextResponse.json({ error: "Código inválido." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Não consegui ligar o código. Tenta de novo." }, { status: 500 });
  }
}
