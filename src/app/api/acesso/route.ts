import { NextResponse } from "next/server";
import { haCodigosConfigurados, hojeEmLuanda, normalizarCodigo } from "../../../lib/acesso";
import { temSupabase } from "../../../lib/acessos";
import { resolverAcesso } from "../../../lib/assinatura";
import { primeiroNome } from "../../../lib/contacto";
import { formatarData } from "../../../lib/planos";
import { erroDeArmazenamento, lerTrocasDoDia } from "../../../lib/uso";

export async function POST(req: Request) {
  if (!haCodigosConfigurados() && !temSupabase()) {
    return NextResponse.json(
      { error: "Ainda não há códigos de acesso configurados (CODIGOS_ACESSO no .env.local)." },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as { codigo?: unknown } | null;

  let r;
  try {
    r = await resolverAcesso(body?.codigo);
  } catch {
    return NextResponse.json({ error: "Não consegui verificar o teu acesso." }, { status: 500 });
  }

  if (!r.ok) {
    if (r.motivo === "invalido") {
      await new Promise((res) => setTimeout(res, 600)); // trava tentativas rápidas de adivinhar
      return NextResponse.json({ error: "Código inválido." }, { status: 401 });
    }
    if (r.motivo === "inativo") {
      return NextResponse.json(
        { error: "Este código foi desativado. Fala com quem te deu o código.", inativo: true },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: `A tua assinatura ${r.plano} terminou em ${formatarData(r.validoAte)}. Renova para continuares a estudar.`,
        expirado: true,
        validoAte: r.validoAte,
      },
      { status: 403 }
    );
  }

  if (r.tipo === "ilimitado") {
    return NextResponse.json({ ok: true, tipo: "ilimitado", restantes: null, limite: null });
  }

  const erroArm = erroDeArmazenamento();
  if (erroArm) return NextResponse.json({ error: erroArm }, { status: 500 });

  try {
    const usadas = await lerTrocasDoDia(normalizarCodigo(body?.codigo), hojeEmLuanda());
    return NextResponse.json({
      ok: true,
      tipo: "normal",
      restantes: Math.max(0, r.limite - usadas),
      limite: r.limite,
      plano: r.plano ?? null,
      validoAte: r.validoAte ?? null,
      diasRestantes: r.diasRestantes ?? null,
      nome: primeiroNome(r.nome) || null,
    });
  } catch {
    return NextResponse.json({ error: "Não consegui verificar o limite de uso." }, { status: 500 });
  }
}
