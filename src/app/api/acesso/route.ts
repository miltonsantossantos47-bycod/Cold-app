import { NextResponse } from "next/server";
import { haCodigosConfigurados, hojeEmLuanda } from "../../../lib/acesso";
import { temSupabase } from "../../../lib/acessos";
import { resolverPedido } from "../../../lib/assinatura";
import { primeiroNome } from "../../../lib/contacto";
import { respostaDeBloqueio, sessaoInvalida } from "../../../lib/respostas";
import { estadoTestes } from "../../../lib/testes";
import { erroDeArmazenamento, lerTrocasDoDia } from "../../../lib/uso";

export async function POST(req: Request) {
  if (!haCodigosConfigurados() && !temSupabase()) {
    return NextResponse.json(
      { error: "Ainda não há códigos de acesso configurados (CODIGOS_ACESSO no .env.local)." },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as { codigo?: unknown } | null;

  let p;
  try {
    p = await resolverPedido(req, body?.codigo);
  } catch {
    return NextResponse.json({ error: "Não consegui verificar o teu acesso." }, { status: 500 });
  }
  if (p.tipo === "sessao-invalida") return sessaoInvalida();

  const r = p.resolucao;
  if (!r.ok) {
    if (r.motivo === "sem-plano") {
      let testeAberto = false;
      try {
        testeAberto = (await estadoTestes()).aberto;
      } catch {
        /* sem teste disponível */
      }
      return NextResponse.json({ ok: true, semPlano: true, testeAberto });
    }
    if (r.motivo === "invalido") await new Promise((res) => setTimeout(res, 600)); // trava tentativas rápidas de adivinhar
    return respostaDeBloqueio(r);
  }

  if (r.tipo === "ilimitado") {
    return NextResponse.json({ ok: true, tipo: "ilimitado", restantes: null, limite: null });
  }

  const erroArm = erroDeArmazenamento();
  if (erroArm) return NextResponse.json({ error: erroArm }, { status: 500 });

  try {
    const usadas = await lerTrocasDoDia(r.codigo, hojeEmLuanda());
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
