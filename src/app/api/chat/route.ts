import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "../../../lib/system-prompt";
import { CURRICULO } from "../../../lib/curriculo";
import {
  haCodigosConfigurados,
  hojeEmLuanda,
  limiteDiario,
  normalizarCodigo,
  tipoDoCodigo,
} from "../../../lib/acesso";
import { erroDeArmazenamento, lerTrocasDoDia, registarTroca } from "../../../lib/uso";

type Msg = { role: "user" | "assistant"; content: string };

type Perfil = {
  area?: string;
  nivel_atual?: string;
  objetivo?: string;
  ritmo_semanal?: string;
  modulo_atual?: string;
  licao_atual?: string;
  dificuldades_recentes?: string;
};

const MAX_CARACTERES_MENSAGEM = 4000;

const NOTA_FORMATO = `

## Formato de escrita (o ecrã mostra só texto simples)
- Não uses LaTeX nem $...$. Escreve fórmulas em texto simples (ex.: v = Δx / Δt, x^2).
- Podes usar **negrito**, listas com "-" e blocos de código (três crases) para diagramas ASCII e tabelas.
- Na linha [[ESTADO: ...]] usa os ids do currículo (ex.: mat-2-1). Se ainda não escolheste lição, usa a mais adequada ao diagnóstico.`;

function limparMensagens(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  const msgs: Msg[] = [];
  for (const m of raw) {
    if (
      m &&
      typeof m === "object" &&
      ((m as Msg).role === "user" || (m as Msg).role === "assistant") &&
      typeof (m as Msg).content === "string" &&
      (m as Msg).content.trim() !== ""
    ) {
      msgs.push({ role: (m as Msg).role, content: (m as Msg).content });
    }
  }
  // Só as últimas 30 mensagens, para controlar o custo; a primeira tem de ser do aluno.
  let recentes = msgs.slice(-30);
  while (recentes.length > 0 && recentes[0].role !== "user") recentes = recentes.slice(1);
  return recentes;
}

function perfilEmTexto(p: Perfil): string {
  return [
    `- área: ${p.area || "não indicada"}`,
    `- nível_atual: ${p.nivel_atual || "não indicado"}`,
    `- objetivo: ${p.objetivo || "não indicado"}`,
    `- ritmo_semanal: ${p.ritmo_semanal || "não indicado"}`,
    `- módulo_atual: ${p.modulo_atual || "ainda nenhum (primeira sessão: começa pelo diagnóstico)"}`,
    `- lição_atual: ${p.licao_atual || "ainda nenhuma"}`,
    `- dificuldades_recentes: ${p.dificuldades_recentes || "nenhuma registada"}`,
  ].join("\n");
}

function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function lerEstado(texto: string): { modulo?: string; licao?: string; dominio?: string } | null {
  const m = texto.match(/\[\[ESTADO:\s*([^\]]*)\]\]/);
  if (!m) return null;
  const estado: Record<string, string> = {};
  for (const par of m[1].split(";")) {
    const i = par.indexOf("=");
    if (i === -1) continue;
    estado[semAcentos(par.slice(0, i).trim())] = par.slice(i + 1).trim();
  }
  return { modulo: estado["modulo"], licao: estado["licao"], dominio: estado["dominio"] };
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta a ANTHROPIC_API_KEY no ficheiro .env.local (e reinicia o npm run dev)." },
      { status: 500 }
    );
  }
  if (!haCodigosConfigurados()) {
    return NextResponse.json(
      { error: "Ainda não há códigos de acesso configurados (CODIGOS_ACESSO no .env.local)." },
      { status: 500 }
    );
  }

  let body: { messages?: unknown; perfil?: Perfil; codigo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  // 1) Quem é? Sem código válido não gasta um cêntimo.
  const tipo = tipoDoCodigo(body.codigo);
  if (!tipo) {
    return NextResponse.json({ error: "Código de acesso inválido.", codigoInvalido: true }, { status: 401 });
  }
  const codigo = normalizarCodigo(body.codigo);

  const messages = limparMensagens(body.messages);
  if (messages.length === 0) {
    return NextResponse.json({ error: "Sem mensagens para enviar." }, { status: 400 });
  }
  if (messages[messages.length - 1].content.length > MAX_CARACTERES_MENSAGEM) {
    return NextResponse.json(
      { error: `A mensagem é demasiado longa (máximo ${MAX_CARACTERES_MENSAGEM} caracteres).` },
      { status: 400 }
    );
  }

  // 2) Ainda tem trocas disponíveis hoje?
  const erroArm = erroDeArmazenamento();
  if (erroArm) return NextResponse.json({ error: erroArm }, { status: 500 });

  const dia = hojeEmLuanda();
  const limite = limiteDiario();
  let usadas = 0;
  try {
    usadas = await lerTrocasDoDia(codigo, dia);
  } catch {
    return NextResponse.json({ error: "Não consegui verificar o limite de uso." }, { status: 500 });
  }
  if (tipo === "normal" && usadas >= limite) {
    return NextResponse.json(
      { error: `Atingiste o limite de ${limite} trocas por hoje. Volta amanhã.`, restantes: 0, limite },
      { status: 429 }
    );
  }

  // 3) Chama o modelo.
  const perfil: Perfil = body.perfil ?? {};
  const system =
    SYSTEM_PROMPT.replace("{{PERFIL_DO_ALUNO}}", () => perfilEmTexto(perfil)).replace(
      "{{CURRICULO}}",
      () => JSON.stringify(CURRICULO, null, 2)
    ) + NOTA_FORMATO;

  const baseUrl = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 2000,
        system,
        messages,
      }),
    });
  } catch {
    return NextResponse.json({ error: "Não consegui ligar à API da Anthropic. Verifica a internet." }, { status: 502 });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? "Erro da API da Anthropic.";
    return NextResponse.json({ error: msg }, { status: res.status });
  }

  const texto: string = (data?.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");

  // 4) Só conta a troca (e os tokens) quando a resposta chegou bem.
  try {
    await registarTroca(codigo, dia, data?.usage?.input_tokens ?? 0, data?.usage?.output_tokens ?? 0);
  } catch (e) {
    console.error("Falhou o registo de uso:", e);
  }

  const estado = lerEstado(texto);
  const reply = texto.replace(/\[\[ESTADO:[^\]]*\]\]/g, "").trim();

  return NextResponse.json({
    reply,
    estado,
    restantes: tipo === "ilimitado" ? null : Math.max(0, limite - (usadas + 1)),
    limite: tipo === "ilimitado" ? null : limite,
  });
}
