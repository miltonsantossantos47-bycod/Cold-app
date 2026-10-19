import { NextResponse } from "next/server";
import { diaEmLuandaHaDias, tipoDoCodigo } from "../../../lib/acesso";
import { erroDeArmazenamento, listarUso } from "../../../lib/uso";

export const dynamic = "force-dynamic";

// Preços em dólares por milhão de tokens (Sonnet 5.5). Confirma na página de preços da Anthropic.
const PRECOS = { entrada_usd_por_milhao: 2, saida_usd_por_milhao: 10 };

export async function GET(req: Request) {
  // Só os códigos "ilimitados" (os teus) podem ver o uso.
  if (tipoDoCodigo(req.headers.get("x-codigo")) !== "ilimitado") {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const erroArm = erroDeArmazenamento();
  if (erroArm) return NextResponse.json({ error: erroArm }, { status: 500 });

  try {
    const linhas = await listarUso(diaEmLuandaHaDias(14));
    return NextResponse.json({ linhas, precos: PRECOS });
  } catch {
    return NextResponse.json({ error: "Não consegui ler o uso." }, { status: 500 });
  }
}
