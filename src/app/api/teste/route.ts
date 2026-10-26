import { NextResponse } from "next/server";
import { hojeEmLuanda, tipoDoCodigo } from "../../../lib/acesso";
import { contarTestesAutoHoje, criarAcesso, existeContacto, gerarCodigo, temSupabase } from "../../../lib/acessos";
import { normalizarTelefone, primeiroNome } from "../../../lib/contacto";

export const dynamic = "force-dynamic";

// Quantos testes grátis automáticos se aceitam por dia. 0 (ou sem variável) = fechado.
function limiteDiarioDeTestes(): number {
  const n = parseInt(process.env.TESTES_LIVRES_POR_DIA ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function whatsapp(): string {
  return (process.env.WHATSAPP_NUMERO ?? "").replace(/\D/g, "");
}

async function estado(): Promise<{ aberto: boolean; motivo?: "fechado" | "esgotado" }> {
  const limite = limiteDiarioDeTestes();
  if (limite === 0 || !temSupabase()) return { aberto: false, motivo: "fechado" };
  const hoje = await contarTestesAutoHoje(hojeEmLuanda());
  return hoje >= limite ? { aberto: false, motivo: "esgotado" } : { aberto: true };
}

export async function GET() {
  try {
    return NextResponse.json({ ...(await estado()), whatsapp: whatsapp() });
  } catch {
    return NextResponse.json({ aberto: false, motivo: "fechado", whatsapp: whatsapp() });
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  if (typeof b.website === "string" && b.website.trim() !== "") {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 }); // campo-armadilha para robôs
  }

  try {
    const st = await estado();
    if (!st.aberto) {
      return NextResponse.json(
        {
          error:
            st.motivo === "esgotado"
              ? "Os testes grátis de hoje já esgotaram. Volta amanhã ou fala connosco por WhatsApp."
              : "Os testes grátis estão fechados de momento. Fala connosco por WhatsApp.",
          fechado: true,
        },
        { status: st.motivo === "esgotado" ? 429 : 403 }
      );
    }

    const nome = typeof b.nome === "string" ? b.nome.trim().slice(0, 80) : "";
    if (nome.length < 2) return NextResponse.json({ error: "Escreve o teu nome." }, { status: 400 });
    const tel = normalizarTelefone(b.whatsapp);
    if (!tel) return NextResponse.json({ error: "Escreve um número de WhatsApp válido (ex.: 923 111 222)." }, { status: 400 });

    // Um teste por número. Não mostramos o código antigo, para ninguém o ir buscar com o número de outra pessoa.
    if (await existeContacto(tel)) {
      return NextResponse.json(
        { error: "Este número já recebeu um acesso. Se perdeste o código, fala connosco por WhatsApp." },
        { status: 409 }
      );
    }

    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const codigo = gerarCodigo();
      if (tipoDoCodigo(codigo)) continue;
      const criado = await criarAcesso({
        codigo,
        nome,
        contacto: tel,
        plano: "teste",
        limite_diario: null,
        inicio: null, // os 7 dias contam a partir do 1.º uso
        valido_ate: null,
        ativo: true,
        notas: "auto-teste",
      });
      if (criado) return NextResponse.json({ ok: true, codigo, nome: primeiroNome(nome) });
    }
    return NextResponse.json({ error: "Não consegui criar o teu acesso. Tenta de novo." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Não consegui criar o teu acesso. Tenta de novo." }, { status: 500 });
  }
}
