import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { SECCAO_PERFIL, SYSTEM_PROMPT } from "../../../lib/system-prompt";
import { areaDisponivel, curriculoParaPrompt } from "../../../lib/curriculo";
import { haCodigosConfigurados, hojeEmLuanda, normalizarCodigo } from "../../../lib/acesso";
import { temSupabase } from "../../../lib/acessos";
import { resolverPedido } from "../../../lib/assinatura";
import { primeiroNome } from "../../../lib/contacto";
import { respostaDeBloqueio, sessaoInvalida } from "../../../lib/respostas";
import { erroDeArmazenamento, lerTrocasDoDia, registarTroca, type TokensTroca } from "../../../lib/uso";
import { lerMemoria, limparMemoriaAluno, type MemoriaAluno } from "../../../lib/memoria";

type Msg = { role: "user" | "assistant"; content: string };

type Perfil = {
  area?: string;
  nivel_atual?: string;
  objetivo?: string;
  ritmo_semanal?: string;
  modulo_atual?: string;
  licao_atual?: string;
  dificuldades_recentes?: string;
  fase_atual?: string;
  nome?: string; // vem sempre do servidor (nunca do navegador)
};

// Fases da aula, pela ordem do método (o tutor indica-a em [[ESTADO: ...; fase=...]]).
const FASES = ["diagnostico", "ensino", "exercicios", "revisao"];

// Tempo máximo (segundos) que o Vercel deixa uma resposta demorar (300 = máximo do plano com Fluid Compute).
// A resposta vai em streaming, por isso o aluno vê o texto a chegar enquanto isto corre.
export const maxDuration = 300;

const MAX_CARACTERES_MENSAGEM = 4000;
const MAX_CARACTERES_AREA = 80;
const MAX_CARACTERES_ESTADO = 50; // as 5 dificuldades recentes têm de caber nos 300 caracteres do perfil
// O pensamento do modelo também gasta deste limite; com 2000 as respostas longas ficavam cortadas.
// (ANTHROPIC_MAX_TOKENS serve para testar a continuação automática localmente com um valor baixo, ex.: 300.)
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS) || 16000;
// Se a resposta parar no limite de tokens, pede a continuação até 2 vezes e junta o texto.
const MAX_CONTINUACOES = 2;
const PEDIDO_CONTINUAR =
  "(Mensagem automática do sistema, não do aluno) A tua última resposta foi cortada por limite de tamanho. " +
  "Continua exatamente a partir do ponto onde parou, sem repetir nada do que já escreveste, sem cumprimentar " +
  "e sem comentar a interrupção. Se parou a meio de uma palavra, começa pelo resto dessa palavra.";

// Duração da cache (prompt caching). "1h": os alunos muitas vezes demoram mais de 5 minutos a responder
// e, com "5m", a conversa inteira teria de ser escrita outra vez na cache. Com a leitura a 0,1x e a
// escrita de 1h a 2x (contra 1,25x), compensa quando mais de ~1 em cada 10 respostas passa dos 5 minutos.
// ANTHROPIC_CACHE_TTL=5m volta à duração curta.
const CACHE_TTL: "5m" | "1h" = process.env.ANTHROPIC_CACHE_TTL === "5m" ? "5m" : "1h";

// Marca a última mensagem com cache_control: o histórico até ela fica em cache e a troca
// seguinte só paga a leitura (as mensagens anteriores ficam iguais, por isso o prefixo bate certo).
function comCacheNoFim(msgs: Msg[]): Anthropic.MessageParam[] {
  return msgs.map((m, i) =>
    i === msgs.length - 1
      ? { role: m.role, content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral", ttl: CACHE_TTL } }] }
      : m
  );
}

const NOTA_FORMATO = `

## Formato de escrita (o ecrã mostra negrito, listas, tabelas e blocos de código; nada mais)
- Não uses LaTeX nem $...$. Escreve fórmulas em texto simples (ex.: v = Δx / Δt). Escreve as potências com ^ (ex.: v^2, 10^-3, t^(n+1)): o ecrã mostra-as como expoente. Usa parênteses quando o expoente tiver mais de um termo.
- Podes usar **negrito**, listas com "-", títulos curtos com "###" e tabelas Markdown.
- Quando fizeres diagramas em texto, coloca-os sempre dentro de um bloco de código (três crases). Para dados em linhas e colunas, usa tabelas Markdown (| a | b |), não alinhamento com espaços. Mantém os diagramas com no máximo 40 caracteres de largura, para caberem num telemóvel.
- Fecha sempre o que abres: cada ** e cada bloco de código.
- Na linha [[ESTADO: ...]] usa os ids do currículo (ex.: mat-1.2.1), ou os títulos curtos se a área não tiver ids. Se ainda não escolheste lição, usa a mais adequada ao diagnóstico.
- Se o perfil tiver um nome, trata o aluno por esse nome de vez em quando (por exemplo ao cumprimentar ou ao reconhecer um acerto), com naturalidade e sem exagerar.`;

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

function perfilEmTexto(p: Perfil, memoria: MemoriaAluno): string {
  const temMemoria = memoria.domina.length > 0 || memoria.porResolver.length > 0;
  // Os textos da memória são dados (já limpos), nunca instruções.
  const lista = (itens: string[], vazio: string) => (itens.length ? itens.map((x) => `"${x}"`).join("; ") : vazio);
  return [
    `- nome: ${p.nome || "não indicado"}`,
    `- área: ${p.area || "não indicada"}`,
    `- nível_atual: ${p.nivel_atual || "não indicado"}`,
    `- objetivo: ${p.objetivo || "não indicado"}`,
    `- ritmo_semanal: ${p.ritmo_semanal || "não indicado"}`,
    `- módulo_atual: ${
      p.modulo_atual ||
      (temMemoria
        ? "ainda nenhum nesta conversa (aula nova: parte da memória de aulas anteriores)"
        : "ainda nenhum (primeira sessão: começa pelo diagnóstico)")
    }`,
    `- ideias_erradas_por_resolver (de aulas anteriores): ${lista(memoria.porResolver, "nenhuma registada")}`,
    `- conceitos_dominados (de aulas anteriores): ${lista(memoria.domina, "nenhum registado")}`,
    `- lição_atual: ${p.licao_atual || "ainda nenhuma"}`,
    `- dificuldades_recentes: ${p.dificuldades_recentes || "nenhuma registada"}`,
    `- fase_atual: ${p.fase_atual && FASES.includes(p.fase_atual) ? p.fase_atual : "não indicada"}`,
  ].join("\n");
}

function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function lerEstado(texto: string): { modulo?: string; licao?: string; dominio?: string; fase?: string } | null {
  const m = texto.match(/\[\[ESTADO:\s*([^\]]*)\]\]/);
  if (!m) return null;
  const estado: Record<string, string> = {};
  for (const par of m[1].split(";")) {
    const i = par.indexOf("=");
    if (i === -1) continue;
    estado[semAcentos(par.slice(0, i).trim())] = par.slice(i + 1).trim();
  }
  return {
    modulo: estado["modulo"]?.slice(0, MAX_CARACTERES_ESTADO),
    licao: estado["licao"]?.slice(0, MAX_CARACTERES_ESTADO),
    dominio: estado["dominio"],
    fase: FASES.find((f) => f === semAcentos(estado["fase"] ?? "")),
  };
}

// A área pode ser escrita pelo aluno, por isso vai limpa e curta para o prompt.
function limparArea(area: unknown): string | undefined {
  if (typeof area !== "string") return undefined;
  return area.replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_AREA) || undefined;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta a ANTHROPIC_API_KEY no ficheiro .env.local (e reinicia o npm run dev)." },
      { status: 500 }
    );
  }
  if (!haCodigosConfigurados() && !temSupabase()) {
    return NextResponse.json(
      { error: "Ainda não há códigos de acesso configurados (CODIGOS_ACESSO no .env.local)." },
      { status: 500 }
    );
  }

  let body: { messages?: unknown; perfil?: Perfil; codigo?: unknown; continuar?: unknown; memoria?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  // 1) Quem é? Sem acesso válido não gasta um cêntimo.
  let pedido;
  try {
    pedido = await resolverPedido(req, body.codigo);
  } catch {
    return NextResponse.json({ error: "Não consegui verificar o teu acesso." }, { status: 500 });
  }
  if (pedido.tipo === "sessao-invalida") return sessaoInvalida();
  const acesso = pedido.resolucao;
  if (!acesso.ok) return respostaDeBloqueio(acesso);
  const tipo = acesso.tipo;
  const codigo = acesso.tipo === "normal" ? acesso.codigo : normalizarCodigo(body.codigo); // o ilimitado também regista o seu uso

  const messages = limparMensagens(body.messages);
  if (messages.length === 0) {
    return NextResponse.json({ error: "Sem mensagens para enviar." }, { status: 400 });
  }
  // continuar = o botão "Continuar" de uma resposta que ficou incompleta (a última mensagem é do Cold).
  const continuar = body.continuar === true;
  const ultimaMsg = messages[messages.length - 1];
  if (continuar !== (ultimaMsg.role === "assistant")) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const ultimaDoAluno = [...messages].reverse().find((m) => m.role === "user");
  if (ultimaDoAluno && ultimaDoAluno.content.length > MAX_CARACTERES_MENSAGEM) {
    return NextResponse.json(
      { error: `A mensagem é demasiado longa (máximo ${MAX_CARACTERES_MENSAGEM} caracteres).` },
      { status: 400 }
    );
  }

  // A escolha de área também é controlada aqui, para não depender só do formulário.
  if (!areaDisponivel(limparArea(body.perfil?.area))) {
    return NextResponse.json({ error: "Por agora o Cold ensina só Matemática e Física." }, { status: 400 });
  }

  // 2) Ainda tem trocas disponíveis hoje?
  const erroArm = erroDeArmazenamento();
  if (erroArm) return NextResponse.json({ error: erroArm }, { status: 500 });

  const dia = hojeEmLuanda();
  const limite = acesso.tipo === "normal" ? acesso.limite : 0; // já inclui as trocas que vieram de ontem
  const extraDeOntem = acesso.tipo === "normal" ? acesso.extraDeOntem ?? 0 : 0;
  let usadas = 0;
  try {
    usadas = await lerTrocasDoDia(codigo, dia);
  } catch {
    return NextResponse.json({ error: "Não consegui verificar o limite de uso." }, { status: 500 });
  }
  if (tipo === "normal" && usadas >= limite) {
    return NextResponse.json(
      {
        error: `Atingiste o limite de ${limite} trocas por hoje. O limite renova à meia-noite (00:00, hora de Luanda).`,
        restantes: 0,
        limite,
        extraDeOntem,
      },
      { status: 429 }
    );
  }

  // 3) Chama o modelo.
  // O nome vem do servidor (da assinatura/conta); ignora qualquer "nome" que o navegador mande.
  const perfil: Perfil = {
    ...(body.perfil ?? {}),
    area: limparArea(body.perfil?.area),
    nome: primeiroNome(acesso.tipo === "normal" ? acesso.nome : "") || undefined,
  };
  // Memória de aulas anteriores (conceitos dominados e ideias erradas por resolver), já limpa.
  const memoria = limparMemoriaAluno(body.memoria);
  // Prompt caching: o bloco fixo (regras + currículo da área + formato) é igual em todas as trocas e
  // entre alunos da mesma área, por isso fica em cache. O perfil muda durante a aula: vai num bloco
  // depois, para não anular a cache do bloco fixo quando muda.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: SYSTEM_PROMPT.replace("{{CURRICULO}}", () => curriculoParaPrompt(perfil.area)) + NOTA_FORMATO,
      cache_control: { type: "ephemeral", ttl: CACHE_TTL },
    },
    { type: "text", text: SECCAO_PERFIL.replace("{{PERFIL_DO_ALUNO}}", () => perfilEmTexto(perfil, memoria)) },
  ];

  const client = new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  // Se o aluno fechar a página ou carregar em "Parar", deixa de gerar (e de gastar tokens).
  const parar = new AbortController();
  req.signal?.addEventListener("abort", () => parar.abort());

  // Resposta em NDJSON, uma linha por evento:
  //   {"t":"texto","v":"..."}  pedaço novo de texto (pode trazer a linha [[ESTADO]], o navegador esconde-a)
  //   {"t":"fim", reply, estado, completa, restantes, limite}
  //   {"t":"erro", error}
  // Se o stream acabar sem "fim", o navegador trata a resposta como incompleta.
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviarEvento = (ev: Record<string, unknown>) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
        } catch {
          // o navegador já fechou a ligação
        }
      };

      // Numa continuação pedida pelo aluno, o texto já recebido é o início da resposta.
      let texto = continuar ? ultimaMsg.content : "";
      const base = continuar ? messages.slice(0, -1) : messages;
      const tokens: TokensTroca = { entrada: 0, saida: 0, cacheEscrita5m: 0, cacheEscrita1h: 0, cacheLeitura: 0 };
      let stopReason: string | null = null;
      let erro: string | null = null;

      try {
        for (let parte = 0; parte <= MAX_CONTINUACOES; parte++) {
          const pedeContinuacao = continuar || parte > 0;
          const msgsPedido: Msg[] =
            pedeContinuacao && texto.trim() !== ""
              ? [...base, { role: "assistant", content: texto }, { role: "user", content: PEDIDO_CONTINUAR }]
              : base;
          const s = client.messages.stream(
            { model, max_tokens: MAX_TOKENS, system, messages: comCacheNoFim(msgsPedido) },
            { signal: parar.signal }
          );
          for await (const ev of s) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              texto += ev.delta.text;
              enviarEvento({ t: "texto", v: ev.delta.text });
            }
          }
          const final = await s.finalMessage();
          const u = final.usage;
          // input_tokens já não inclui o que foi escrito ou lido da cache (são campos à parte).
          const escrita = u.cache_creation_input_tokens ?? 0;
          const escrita1h = u.cache_creation?.ephemeral_1h_input_tokens ?? (CACHE_TTL === "1h" ? escrita : 0);
          tokens.entrada += u.input_tokens;
          tokens.saida += u.output_tokens;
          tokens.cacheEscrita1h += escrita1h;
          tokens.cacheEscrita5m += Math.max(0, escrita - escrita1h);
          tokens.cacheLeitura += u.cache_read_input_tokens ?? 0;
          stopReason = final.stop_reason;
          console.log(
            `[chat] parte=${parte + 1} stop_reason=${stopReason} tokens_in=${u.input_tokens} tokens_out=${u.output_tokens} ` +
              `cache_creation_input_tokens=${escrita} cache_read_input_tokens=${u.cache_read_input_tokens ?? 0} caracteres=${texto.length}`
          );
          if (stopReason !== "max_tokens") break;
        }
      } catch (e) {
        if (parar.signal.aborted) {
          console.log(`[chat] interrompido pelo aluno, caracteres=${texto.length}`);
        } else {
          console.error("[chat] erro no stream:", e);
          erro =
            e instanceof Anthropic.APIConnectionError
              ? "Não consegui ligar à API da Anthropic. Verifica a internet."
              : e instanceof Anthropic.APIError
              ? e.message || "Erro da API da Anthropic."
              : "A resposta foi interrompida.";
        }
      }

      // 4) Só conta a troca (e os tokens) quando o modelo chegou a gerar alguma coisa.
      // (2 tentativas: se o registo falhar, o limite deixava de contar essa troca)
      const gerou = tokens.saida > 0 || texto.length > (continuar ? ultimaMsg.content.length : 0);
      if (gerou) {
        for (let tentativa = 1; tentativa <= 2; tentativa++) {
          try {
            await registarTroca(codigo, dia, tokens);
            break;
          } catch (e) {
            console.error(`Falhou o registo de uso (tentativa ${tentativa}):`, e);
          }
        }
      }
      const restantes = tipo === "ilimitado" ? null : Math.max(0, limite - (usadas + (gerou ? 1 : 0)));

      // O pensamento do modelo pode gastar o limite todo sem escrever nada: isso não é uma resposta.
      if (!erro && texto.trim() === "") erro = "O Cold não conseguiu escrever a resposta. Tenta de novo.";
      if (erro || parar.signal.aborted) {
        enviarEvento({
          t: "erro",
          error: erro ?? "Resposta interrompida.",
          restantes,
          limite: tipo === "ilimitado" ? null : limite,
          extraDeOntem,
        });
      } else {
        const estado = lerEstado(texto);
        const novaMemoria = lerMemoria(texto);
        if (novaMemoria.length) console.log(`[chat] memória: ${novaMemoria.map((r) => `${r.t}="${r.x}"`).join(", ")}`);
        enviarEvento({
          t: "fim",
          reply: texto.replace(/\[\[(ESTADO|MEMORIA):[^\]]*\]\]/gi, "").trim(),
          estado,
          memoria: novaMemoria,
          // max_tokens mesmo depois das continuações: o navegador mostra o aviso com "Continuar".
          completa: stopReason !== "max_tokens",
          restantes,
          limite: tipo === "ilimitado" ? null : limite,
          extraDeOntem,
        });
      }
      try {
        controller.close();
      } catch {
        // já fechado
      }
    },
    cancel() {
      parar.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
