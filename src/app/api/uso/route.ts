import { NextResponse } from "next/server";
import { diaEmLuandaHaDias, hojeEmLuanda, normalizarCodigo, tipoDoCodigo } from "../../../lib/acesso";
import { apagarUso, erroDeArmazenamento, listarUso } from "../../../lib/uso";

export const dynamic = "force-dynamic";

// Preços em dólares por milhão de tokens do Claude Sonnet 5.5 (documentação de prompt caching da Anthropic):
// entrada US$ 2; escrita na cache 1,25x (5 min) = 2,50 e 2x (1 h) = 4; leitura da cache 0,05x = 0,10; saída 10.
const PRECOS = {
  entrada_usd_por_milhao: 2,
  cache_escrita_5m_usd_por_milhao: 2.5,
  cache_escrita_1h_usd_por_milhao: 4,
  cache_leitura_usd_por_milhao: 0.1,
  saida_usd_por_milhao: 10,
};

function admin(req: Request): boolean {
  // Só os códigos "ilimitados" (os teus) podem ver e limpar o uso.
  return tipoDoCodigo(req.headers.get("x-codigo")) === "ilimitado";
}

export async function GET(req: Request) {
  if (!admin(req)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const erroArm = erroDeArmazenamento();
  if (erroArm) return NextResponse.json({ error: erroArm }, { status: 500 });

  try {
    const linhas = await listarUso(diaEmLuandaHaDias(14));
    return NextResponse.json({ linhas, precos: PRECOS, hoje: hojeEmLuanda() });
  } catch {
    return NextResponse.json({ error: "Não consegui ler o uso." }, { status: 500 });
  }
}

// Limpar histórico: {acao:"limpar"} apaga todos os dias anteriores a hoje;
// com "codigo" e/ou "dia" apaga só essas linhas. Nunca apaga hoje (senão os limites diários voltavam a zero).
export async function POST(req: Request) {
  if (!admin(req)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const erroArm = erroDeArmazenamento();
  if (erroArm) return NextResponse.json({ error: erroArm }, { status: 500 });

  const b = (await req.json().catch(() => null)) as { acao?: unknown; codigo?: unknown; dia?: unknown } | null;
  if (!b || b.acao !== "limpar") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const hoje = hojeEmLuanda();
  let dia: string | undefined;
  if (b.dia !== undefined) {
    if (typeof b.dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.dia)) {
      return NextResponse.json({ error: "Dia inválido." }, { status: 400 });
    }
    if (b.dia >= hoje) {
      return NextResponse.json(
        { error: "Só se apaga o histórico de dias anteriores a hoje (para não repor os limites de hoje)." },
        { status: 400 }
      );
    }
    dia = b.dia;
  }
  let codigo: string | undefined;
  if (b.codigo !== undefined) {
    codigo = normalizarCodigo(b.codigo);
    if (!codigo) return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  try {
    const apagadas = await apagarUso({ antesDe: hoje, codigo, dia });
    return NextResponse.json({ ok: true, apagadas });
  } catch {
    return NextResponse.json({ error: "Não consegui apagar o histórico." }, { status: 500 });
  }
}
