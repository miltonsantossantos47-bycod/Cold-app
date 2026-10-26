import { NextResponse } from "next/server";
import { haCodigosConfigurados, hojeEmLuanda, limiteDiario, tipoDoCodigo, normalizarCodigo } from "../../../lib/acesso";
import { erroDeArmazenamento, lerTrocasDoDia } from "../../../lib/uso";

export async function POST(req: Request) {
  if (!haCodigosConfigurados()) {
    return NextResponse.json(
      { error: "Ainda não há códigos de acesso configurados (CODIGOS_ACESSO no .env.local)." },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as { codigo?: unknown } | null;
  const tipo = tipoDoCodigo(body?.codigo);
  if (!tipo) {
    await new Promise((r) => setTimeout(r, 600)); // trava tentativas rápidas de adivinhar
    return NextResponse.json({ error: "Código inválido." }, { status: 401 });
  }

  if (tipo === "ilimitado") {
    return NextResponse.json({ ok: true, tipo, restantes: null, limite: null });
  }

  const erroArm = erroDeArmazenamento();
  if (erroArm) return NextResponse.json({ error: erroArm }, { status: 500 });

  try {
    const limite = limiteDiario(body?.codigo);
    const usadas = await lerTrocasDoDia(normalizarCodigo(body?.codigo), hojeEmLuanda());
    return NextResponse.json({ ok: true, tipo, restantes: Math.max(0, limite - usadas), limite });
  } catch {
    return NextResponse.json({ error: "Não consegui verificar o limite de uso." }, { status: 500 });
  }
}
