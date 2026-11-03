import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "../../../lib/system-prompt";
import { areaDisponivel, curriculoParaPrompt } from "../../../lib/curriculo";
import { haCodigosConfigurados, hojeEmLuanda, normalizarCodigo } from "../../../lib/acesso";
import { temSupabase } from "../../../lib/acessos";
import { resolverPedido } from "../../../lib/assinatura";
import { primeiroNome } from "../../../lib/contacto";
import { respostaDeBloqueio, sessaoInvalida } from "../../../lib/respostas";
import { erroDeArmazenamento, lerTrocasDoDia, registarTroca, type UsoTokens } from "../../../lib/uso";

type Msg = { role: "user" | "assistant"; content: string };

type Perfil = {
  area?: string;
  nivel_atual?: string;
  objetivo?: string;
  ritmo_semanal?: string;
  modulo_atual?: string;
  licao_atual?: string;
  dificuldades_recentes?: string;
  nome?: string; // vem sempre do servidor (nunca do navegador)
};

// Tempo máximo (segundos) que o Vercel deixa uma resposta demorar.
export const maxDuration = 300;

// O pensamento também gasta do max_tokens, por isso o teto é folgado. É só um teto: paga-se o que se gera.
const MAX_TOKENS = 16000;
// Se a resposta parar no teto de tokens, pede-se a continuação (no máximo 2 vezes) e junta-se o texto.
const MAX_CONTINUACOES = 2;
const PEDIDO_CONTINUAR =
  "Continua a tua resposta anterior exatamente de onde parou, sem repetir nada e sem introdução. " +
  "Se tiver parado a meio de uma palavra, escreve só o resto dessa palavra.";

const MAX_CARACTERES_MENSAGEM = 4000;
const MAX_CARACTERES_AREA = 80;
const MAX_CARACTERES_ESTADO = 50; // as 5 dificuldades recentes têm de caber nos 300 caracteres do perfil

const NOTA_FORMATO = `

## Formato de escrita (o ecrã mostra só texto simples)
- Não uses LaTeX nem $...$. Escreve fórmulas em texto simples (ex.: v = Δx / Δt, x^2).
- Podes usar **negrito**, listas com "-" e blocos de código (três crases) para diagramas ASCII e tabelas.
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

function perfilEmTexto(p: Perfil): string {
  return [
    `- nome: ${p.nome || "não indicado"}`,
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
  return {
    modulo: estado["modulo"]?.slice(0, MAX_CARACTERES_ESTADO),
    licao: estado["licao"]?.slice(0, MAX_CARACTERES_ESTADO),
    dominio: estado["dominio"],
  };
}

// A área pode ser escrita pelo aluno, por isso vai limpa e curta para o prompt.
function limparArea(area: unknown): string | undefined {
  if (typeof area !== "string") return undefined;
  return area.replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_AREA) || undefined;
}

const TAG_ESTADO = "[[ESTADO";

// Até onde o texto já pode seguir para o ecrã: a linha [[ESTADO: ...]] e o começo dela nunca aparecem ao aluno.
function parteSegura(t: string): number {
  const i = t.indexOf(TAG_ESTADO);
  if (i !== -1) return i;
  for (let k = Math.min(TAG_ESTADO.length - 1, t.length); k >= 1; k--) {
    if (t.endsWith(TAG_ESTADO.slice(0, k))) return t.length - k;
  }
  return t.length;
}

function textoVisivel(t: string): string {
  let r = t.replace(/\[\[ESTADO:[^\]]*\]\]/g, "");
  const i = r.indexOf(TAG_ESTADO); // linha de estado cortada a meio
  if (i !== -1) r = r.slice(0, i);
  return r.trim();
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

  let body: { messages?: unknown; perfil?: Perfil; codigo?: unknown };
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
  if (messages[messages.length - 1].content.length > MAX_CARACTERES_MENSAGEM) {
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
  const limite = acesso.tipo === "normal" ? acesso.limite : 0;
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
  const system =
    SYSTEM_PROMPT.replace("{{PERFIL_DO_ALUNO}}", () => perfilEmTexto(perfil)).replace(
      "{{CURRICULO}}",
      () => curriculoParaPrompt(perfil.area)
    ) + NOTA_FORMATO;

  const baseUrl = process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, "") || undefined;
  const client = new Anthropic({ apiKey, baseURL: baseUrl });
  const modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

  // Cache: o prompt do sistema (1 h) e a conversa até à última mensagem (5 min) não se pagam por inteiro a cada troca.
  const sistemaComCache: Anthropic.TextBlockParam[] = [
    { type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } },
  ];
  const mensagensBase: Anthropic.MessageParam[] = messages.map((m, i) =>
    i === messages.length - 1
      ? { role: m.role, content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }] }
      : { role: m.role, content: m.content }
  );

  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  function abrirParte(msgs: Anthropic.MessageParam[]) {
    return client.messages.create(
      { model: modelo, max_tokens: MAX_TOKENS, system: sistemaComCache, messages: msgs, stream: true },
      { signal: ac.signal }
    );
  }

  // A primeira ligação abre-se antes de responder ao navegador: se a API recusar, o erro segue como antes (JSON + estado HTTP).
  let primeira;
  try {
    primeira = await abrirParte(mensagensBase);
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const detalhe = (e.error as { error?: { message?: string } } | undefined)?.error?.message;
      return NextResponse.json({ error: detalhe ?? "Erro da API da Anthropic." }, { status: e.status ?? 502 });
    }
    return NextResponse.json({ error: "Não consegui ligar à API da Anthropic. Verifica a internet." }, { status: 502 });
  }

  const enc = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (o: Record<string, unknown>) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          /* o navegador já saiu */
        }
      };

      let acumulado = ""; // todo o texto gerado (todas as partes)
      let emitido = 0; // quanto já foi enviado ao navegador
      const total: UsoTokens = { entrada: 0, saida: 0, escrita5m: 0, escrita1h: 0, leitura: 0 };
      let interrompido = false;
      let falhou = "";

      try {
        let stream = primeira;
        for (let parte = 1; parte <= 1 + MAX_CONTINUACOES; parte++) {
          const uso: UsoTokens = { entrada: 0, saida: 0, escrita5m: 0, escrita1h: 0, leitura: 0 };
          let paragem: string | null = null;
          const inicioParte = acumulado.length;
          let recebeuSaida = false;

          try {
            for await (const ev of stream) {
              if (ev.type === "message_start") {
                const u = ev.message.usage as unknown as Record<string, unknown>;
                uso.entrada = Number(u.input_tokens) || 0;
                uso.leitura = Number(u.cache_read_input_tokens) || 0;
                const cc = (u.cache_creation ?? null) as Record<string, number> | null;
                if (cc) {
                  uso.escrita5m = Number(cc.ephemeral_5m_input_tokens) || 0;
                  uso.escrita1h = Number(cc.ephemeral_1h_input_tokens) || 0;
                } else {
                  uso.escrita5m = Number(u.cache_creation_input_tokens) || 0;
                }
              } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                acumulado += ev.delta.text;
                const seg = parteSegura(acumulado);
                if (seg > emitido) {
                  enviar({ t: "texto", d: acumulado.slice(emitido, seg) });
                  emitido = seg;
                }
              } else if (ev.type === "message_delta") {
                paragem = ev.delta.stop_reason ?? paragem;
                uso.saida = Number(ev.usage.output_tokens) || uso.saida;
                recebeuSaida = true;
              }
            }
          } catch (e) {
            if (ac.signal.aborted) interrompido = true;
            else falhou = e instanceof Error ? e.message : "Erro durante a resposta.";
          }
          // O SDK termina o ciclo sem erro quando o pedido é abortado, e uma ligação cortada também pode acabar sem evento final.
          if (ac.signal.aborted) interrompido = true;
          else if (paragem === null && !falhou) falhou = "A ligação com o modelo foi cortada.";
          // Se o corte foi a meio, a saída ainda não foi contada pela API: estima-se pelo texto recebido.
          if (!recebeuSaida) uso.saida = Math.ceil((acumulado.length - inicioParte) / 3.5);

          total.entrada += uso.entrada;
          total.saida += uso.saida;
          total.escrita5m += uso.escrita5m;
          total.escrita1h += uso.escrita1h;
          total.leitura += uso.leitura;
          console.log(
            `[chat] parte=${parte} stop_reason=${paragem ?? (interrompido ? "interrompido" : "erro")} ` +
              `tokens_in=${uso.entrada} tokens_out=${uso.saida} cache_escrita=${uso.escrita5m + uso.escrita1h} cache_leitura=${uso.leitura}`
          );

          if (interrompido || falhou) break;
          if (paragem !== "max_tokens" || parte > MAX_CONTINUACOES) break;

          // Parou no teto: pede a continuação com uma mensagem interna (este modelo não aceita "prefill").
          try {
            stream = await abrirParte([
              ...mensagensBase,
              { role: "assistant", content: acumulado.trimEnd() },
              { role: "user", content: PEDIDO_CONTINUAR },
            ]);
          } catch (e) {
            falhou = e instanceof Error ? e.message : "Erro a pedir a continuação.";
            break;
          }
        }
      } finally {
        // 4) Conta a troca (e os tokens) quando houve resposta; se o corte foi antes de chegar texto, não gasta a troca.
        const houveTexto = acumulado.trim().length > 0;
        if (houveTexto || total.saida > 0) {
          for (let tentativa = 1; tentativa <= 2; tentativa++) {
            try {
              await registarTroca(codigo, dia, total);
              break;
            } catch (e) {
              console.error(`Falhou o registo de uso (tentativa ${tentativa}):`, e);
            }
          }
        }

        if (!interrompido) {
          if (falhou && acumulado.trim() === "") {
            enviar({ t: "erro", d: "A resposta foi cortada antes de chegar. Tenta de novo." });
          } else if (falhou) {
            enviar({ t: "erro", d: "A ligação foi cortada a meio da resposta.", parcial: textoVisivel(acumulado) });
          } else {
            const estado = lerEstado(acumulado);
            const gasta = houveTexto || total.saida > 0 ? 1 : 0;
            enviar({
              t: "fim",
              reply: textoVisivel(acumulado),
              estado,
              restantes: tipo === "ilimitado" ? null : Math.max(0, limite - (usadas + gasta)),
              limite: tipo === "ilimitado" ? null : limite,
            });
          }
        }
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(corpo, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
