import { NextResponse } from "next/server";
import { formatarData } from "./planos";
import type { Resolucao } from "./assinatura";

// Resposta HTTP para cada motivo de bloqueio (menos "sem-plano", que cada rota trata à sua maneira).
export function respostaDeBloqueio(r: Extract<Resolucao, { ok: false }>): NextResponse {
  if (r.motivo === "invalido") {
    return NextResponse.json({ error: "Código de acesso inválido.", codigoInvalido: true }, { status: 401 });
  }
  if (r.motivo === "inativo") {
    return NextResponse.json({ error: "Este acesso foi desativado. Fala com quem te deu o código.", inativo: true }, { status: 403 });
  }
  if (r.motivo === "ligado") {
    return NextResponse.json(
      { error: "Este código já está ligado a uma conta. Entra com o teu Google.", ligado: true },
      { status: 403 }
    );
  }
  if (r.motivo === "expirado") {
    return NextResponse.json(
      {
        error: `A tua assinatura ${r.plano} terminou em ${formatarData(r.validoAte)}. Renova para continuares a estudar.`,
        expirado: true,
        validoAte: r.validoAte,
      },
      { status: 403 }
    );
  }
  return NextResponse.json({ error: "Ainda não tens um plano ativo.", semPlano: true }, { status: 403 });
}

export function sessaoInvalida(): NextResponse {
  return NextResponse.json({ error: "A tua sessão terminou. Entra outra vez.", sessaoInvalida: true }, { status: 401 });
}
