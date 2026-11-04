"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AREAS, CURRICULO, OUTRAS_AREAS_ATIVAS } from "../../lib/curriculo";
import { formatarData } from "../../lib/planos";
import {
  CONTAS_ATIVAS,
  contaDaSessao,
  entrarComGoogle,
  sairDaConta,
  sessaoAtual,
  supabaseCliente,
  tokenAtual,
  type Conta,
} from "../../lib/auth-cliente";
import { assinaturaChat, decidirSync } from "../../lib/sync-chats";
import InstalarApp from "./instalar";
import { juntarMemoria, MAX_REGISTOS_POR_CHAT, type MemoriaAluno, type RegistoMemoria, type TipoMemoria } from "../../lib/memoria";

// incompleta = a resposta do Cold parou a meio (rede, "Parar" ou limite); mostra o botão "Continuar".
type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean; incompleta?: boolean };

type Perfil = {
  area: string;
  nivel_atual: string;
  objetivo: string;
  ritmo_semanal: string;
  modulo_atual: string;
  licao_atual: string;
  dificuldades_recentes: string;
  fase_atual?: string; // conversas antigas não a têm: a barra mostra só o tema
  memoria?: RegistoMemoria[]; // o que o tutor registou sobre o aluno neste chat (passa para as aulas seguintes)
};

type Estado = { modulo?: string; licao?: string; dominio?: string; fase?: string };

// As fases do método do Cold, pela ordem em que a aula as percorre.
const FASES = [
  { id: "diagnostico", nome: "Diagnóstico" },
  { id: "ensino", nome: "Ensino" },
  { id: "exercicios", nome: "Exercícios" },
  { id: "revisao", nome: "Revisão" },
];

type Chat = {
  id: string;
  titulo: string;
  tituloDefinido: boolean;
  perfil: Perfil;
  msgs: Msg[];
  criado: number;
  atualizado: number;
};

// Formato antigo (uma só conversa por navegador): só usado para migrar.
const PERFIL_KEY = "cold:perfil";
const MSGS_KEY = "cold:mensagens";
const CODIGO_KEY = "cold:codigo";
// Cada código de acesso tem o seu próprio histórico neste aparelho.
const chatsKey = (codigo: string) => `cold:chats:${codigo}`;
const ativoKey = (codigo: string) => `cold:ativo:${codigo}`;
const PRIMEIRA_MENSAGEM = "Olá! Estou pronto para começar.";
const OUTRA_AREA = "__outra__";
const GRUPOS = ["Hoje", "Ontem", "Últimos 7 dias", "Mais antigos"];
const ALTURA_MAX_CAMPO = 176; // cerca de 6 linhas; depois o campo passa a ter scroll

// Níveis académicos (escolha em lista, para o aluno não ter de escrever).
const NIVEIS = [
  { grupo: "Ensino médio", itens: ["10.ª classe", "11.ª classe", "12.ª classe", "13.ª classe"] },
  {
    grupo: "Universidade",
    itens: ["1.º ano universitário", "2.º ano universitário", "3.º ano universitário", "4.º ano universitário", "5.º ano universitário"],
  },
];
const TODOS_NIVEIS = NIVEIS.flatMap((g) => g.itens);
const OUTRO_TEMA = "__outro__";
const OUTRO_OBJ = "__outro__";
const OBJETIVOS = [
  "Acompanhar a matéria das aulas",
  "Passar numa prova ou exame",
  "Preparar-me para o exame de acesso à universidade",
  "Preparar-me para Engenharia",
  "Recuperar as bases que me faltam",
  "Aprender por interesse",
];
const RITMOS = [
  "Até 2 horas por semana",
  "3 a 5 horas por semana",
  "6 a 10 horas por semana",
  "Mais de 10 horas por semana",
];

// O limite diário renova à meia-noite de Luanda (UTC+1), não 24 h depois de o atingir.
function ateMeiaNoiteLuanda(): string {
  const l = new Date(Date.now() + 3600000);
  const prox = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + 1) - 3600000;
  const min = Math.max(1, Math.ceil((prox - Date.now()) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// Temas = lições das fases ativas do currículo da área escolhida, agrupadas por módulo.
function temasDaArea(nomeArea: string): { modulo: string; licoes: string[] }[] {
  const a = CURRICULO.find((x) => x.area === nomeArea);
  if (!a) return [];
  return a.fases
    .filter((f) => f.ativa)
    .flatMap((f) => f.modulos.map((m) => ({ modulo: m.titulo, licoes: m.licoes.map((l) => l.titulo) })));
}

function novoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

function tituloDe(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 60).trimEnd() + "…" : t || "Novo chat";
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Quando foi a última atividade do chat: "14:42" (hoje), "ontem", "28 out" ou "28 out 2025".
function quandoFoi(ts: number): string {
  const d = new Date(ts);
  const g = grupoDe(ts);
  if (g === "Hoje") return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (g === "Ontem") return "ontem";
  const data = `${d.getDate()} ${MESES[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? data : `${data} ${d.getFullYear()}`;
}

function grupoDe(ts: number): string {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje.getTime() - d.getTime()) / 86400000);
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias <= 7) return "Últimos 7 dias";
  return "Mais antigos";
}

// Quem faz o pedido: a conta Google (token) ou um código.
type Quem = { tipo: "conta" } | { tipo: "codigo"; codigo: string };

async function chamar(url: string, quem: Quem, corpo: Record<string, unknown> = {}, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const body: Record<string, unknown> = { ...corpo };
  if (quem.tipo === "conta") {
    const t = await tokenAtual();
    if (!t) throw new Error("sem sessão");
    headers.Authorization = `Bearer ${t}`;
  } else {
    body.codigo = quem.codigo;
  }
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
}

// Esconde as linhas [[ESTADO: ...]] e [[MEMORIA: ...]] (e o seu início, enquanto ainda está a chegar no stream).
function semEstado(texto: string): string {
  return texto.replace(/\[\[(ESTADO|MEMORIA):[^\]]*\]\]/gi, "").replace(/\[(\[[^\]]*)?$/, "");
}

// O que o Cold sabe do aluno numa área: junta a memória de todos os chats dessa área.
function memoriaDaArea(chats: Chat[], area: string): MemoriaAluno {
  return juntarMemoria(chats.filter((c) => c.perfil.area === area).flatMap((c) => c.perfil.memoria ?? []));
}

// /api/chats: sem corpo = GET; com corpo = POST (guardar/apagar). Precisa de sessão.
async function apiChats(query: string, corpo?: unknown): Promise<Response> {
  const t = await tokenAtual();
  if (!t) throw new Error("sem sessão");
  if (corpo === undefined) return fetch(`/api/chats${query}`, { headers: { Authorization: `Bearer ${t}` } });
  const texto = JSON.stringify(corpo);
  return fetch(`/api/chats${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: texto,
    keepalive: texto.length < 60000, // deixa terminar o envio mesmo se a página fechar
  });
}

const apagarKey = (k: string) => `cold:apagar:${k}`;
const primeiroNomeLocal = (n: string | undefined | null) => (n ?? "").trim().split(/\s+/)[0] ?? "";

function lerStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function gravarStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sem espaço ou storage bloqueado: ignora
  }
}

function apagarStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignora
  }
}

function atualizarPerfil(p: Perfil, estado: Estado): Perfil {
  const novo = { ...p };
  if (estado.modulo) novo.modulo_atual = estado.modulo;
  if (estado.licao) novo.licao_atual = estado.licao;
  if (estado.fase && FASES.some((f) => f.id === estado.fase)) novo.fase_atual = estado.fase;
  if (estado.dominio === "com_dificuldade" && estado.licao) {
    const lista = novo.dificuldades_recentes
      ? novo.dificuldades_recentes.split(", ").filter(Boolean)
      : [];
    if (!lista.includes(estado.licao)) lista.push(estado.licao);
    novo.dificuldades_recentes = lista.slice(-5).join(", ");
  }
  return novo;
}

// Tema principal (o título do chat) e, se for outra, a lição em que a aula está agora
// (ex.: o tutor recuou para um pré-requisito): "Conservação da energia › Energia cinética e potencial".
function temaDoChat(c: Chat): { principal: string; sub: string } {
  let licao = "";
  const id = c.perfil.licao_atual;
  if (id) {
    for (const a of CURRICULO)
      for (const f of a.fases)
        for (const m of f.modulos) {
          const l = m.licoes.find((x) => x.id === id);
          if (l) licao = l.titulo;
        }
  }
  // sem título escolhido (ainda "Novo chat"), o tema é a própria lição
  const principal = c.tituloDefinido ? c.titulo : licao || c.titulo;
  const sub = licao && licao.trim().toLowerCase() !== principal.trim().toLowerCase() ? licao : "";
  return { principal, sub };
}

// O que o Cold lembra de aulas anteriores nesta área (mostrado ao começar um chat novo).
function MemoriaResumo({ area, memoria }: { area: string; memoria: MemoriaAluno }) {
  if (!area || (memoria.porResolver.length === 0 && memoria.domina.length === 0)) return null;
  const MOSTRAR = 3;
  const dominados = memoria.domina.slice(-MOSTRAR).reverse();
  const mais = memoria.domina.length - dominados.length;
  return (
    <div className="memoria-aluno" role="note">
      <strong>O Cold lembra-se das tuas aulas de {area}</strong>
      {memoria.porResolver.length > 0 && (
        <>
          <span className="memoria-titulo">Vai começar por confirmar:</span>
          <ul>
            {memoria.porResolver
              .slice(-MOSTRAR)
              .reverse()
              .map((x) => (
                <li key={x}>{x}</li>
              ))}
          </ul>
        </>
      )}
      {dominados.length > 0 && (
        <span className="memoria-titulo">
          Já dominas: {dominados.join(" · ")}
          {mais > 0 ? ` (e mais ${mais})` : ""}
        </span>
      )}
    </div>
  );
}

// Barra do percurso da aula: tema + fases (✓ feitas, ● atual, ○ por fazer).
// No telemóvel mostra só a fase atual; tocar abre o percurso completo.
function Percurso({ tema, fase }: { tema: { principal: string; sub: string }; fase?: string }) {
  const [aberto, setAberto] = useState(false);
  const atual = FASES.findIndex((f) => f.id === fase);
  const completo = tema.sub ? `${tema.principal} › ${tema.sub}` : tema.principal;
  return (
    <div className="percurso">
      <div className={`percurso-inner${aberto ? " aberto" : ""}`}>
        <span className="percurso-tema" title={completo}>
          {tema.principal}
          {tema.sub && (
            <>
              <span className="percurso-sep" aria-label="; lição atual:">
                {" › "}
              </span>
              <span className="percurso-sub">{tema.sub}</span>
            </>
          )}
        </span>
        {atual >= 0 && (
          <>
            <button
              type="button"
              className="percurso-curto"
              aria-expanded={aberto}
              aria-controls="percurso-fases"
              onClick={() => setAberto((v) => !v)}
            >
              · {FASES[atual].nome} ({atual + 1}/{FASES.length}) <span aria-hidden="true">{aberto ? "▴" : "▾"}</span>
            </button>
            <ol id="percurso-fases" className={`percurso-fases${aberto ? " aberto" : ""}`} aria-label="Percurso da aula">
              {FASES.map((f, i) => (
                <li
                  key={f.id}
                  className={i < atual ? "feita" : i === atual ? "atual" : "futura"}
                  aria-current={i === atual ? "step" : undefined}
                >
                  <span className="marca" aria-hidden="true">
                    {i < atual ? "✓" : i === atual ? "●" : "○"}
                  </span>
                  {f.nome}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

// Potências escritas em texto (v^2, t^(n+1), 10^-3) aparecem como expoente.
const POTENCIA = /\^(?:\(([^()\n]{1,20})\)|([−-]?\d+|[−-]?[A-Za-zα-ωθ]))/g;

function Potencias({ texto }: { texto: string }) {
  const partes: React.ReactNode[] = [];
  let ultimo = 0;
  for (const m of Array.from(texto.matchAll(POTENCIA))) {
    partes.push(texto.slice(ultimo, m.index));
    partes.push(<sup key={m.index}>{m[1] ?? m[2]}</sup>);
    ultimo = m.index! + m[0].length;
  }
  partes.push(texto.slice(ultimo));
  return <>{partes}</>;
}

function Negrito({ texto }: { texto: string }) {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <strong key={i}>
            <Potencias texto={parte} />
          </strong>
        ) : (
          <span key={i}>
            <Potencias texto={parte} />
          </span>
        )
      )}
    </>
  );
}

// Linha separadora de uma tabela Markdown, ex.: |---|:---:|
const SEPARADOR_TABELA = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

// Item de lista Markdown: "- ...", "* ...", "• ...", "1. ..." ou "1) ...", com ou sem recuo.
const ITEM_LISTA = /^([ \t]*)([-*•]|\d{1,3}[.)])[ \t]+(.*)$/;

type Lista = { ordenada: boolean; inicio: number; recuo: number; itens: { texto: string; filhos: Lista[] }[] };

function recuoDe(espacos: string): number {
  return espacos.replace(/\t/g, "    ").length;
}

// Junta os itens seguidos numa árvore de listas (um item com mais recuo fica dentro do anterior).
function montarListas(itens: { recuo: number; ordenada: boolean; numero: number; texto: string }[]): Lista[] {
  const raizes: Lista[] = [];
  const pilha: Lista[] = [];
  for (const it of itens) {
    while (pilha.length > 1 && it.recuo < pilha[pilha.length - 1].recuo) pilha.pop();
    let topo = pilha[pilha.length - 1];
    const ultimoItem = topo?.itens[topo.itens.length - 1];
    if (topo && ultimoItem && it.recuo >= topo.recuo + 2) {
      const sub: Lista = { ordenada: it.ordenada, inicio: it.numero, recuo: it.recuo, itens: [] };
      ultimoItem.filhos.push(sub);
      pilha.push(sub);
      topo = sub;
    } else if (!topo || topo.ordenada !== it.ordenada) {
      const nova: Lista = { ordenada: it.ordenada, inicio: it.numero, recuo: it.recuo, itens: [] };
      if (pilha.length > 1) {
        pilha[pilha.length - 2].itens[pilha[pilha.length - 2].itens.length - 1].filhos.push(nova);
        pilha[pilha.length - 1] = nova;
      } else {
        raizes.push(nova);
        pilha.splice(0, pilha.length, nova);
      }
      topo = nova;
    }
    topo.itens.push({ texto: it.texto, filhos: [] });
  }
  return raizes;
}

function ListaMd({ lista }: { lista: Lista }) {
  const itens = lista.itens.map((it, k) => (
    <li key={k}>
      <Negrito texto={it.texto} />
      {it.filhos.map((f, n) => (
        <ListaMd key={n} lista={f} />
      ))}
    </li>
  ));
  return lista.ordenada ? <ol start={lista.inicio}>{itens}</ol> : <ul>{itens}</ul>;
}

// Texto fora dos blocos de código: negrito, títulos (### ...), listas e tabelas Markdown.
function Texto({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const partes: React.ReactNode[] = [];
  let atual: string[] = [];
  const despejar = () => {
    while (atual.length && atual[atual.length - 1].trim() === "") atual.pop(); // o bloco seguinte já muda de linha
    if (atual.length) partes.push(<Negrito key={partes.length} texto={atual.join("\n")} />);
    atual = [];
  };
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (ITEM_LISTA.test(l)) {
      despejar();
      const itens: { recuo: number; ordenada: boolean; numero: number; texto: string }[] = [];
      let j = i;
      while (j < linhas.length) {
        const m = linhas[j].match(ITEM_LISTA);
        if (m) {
          const ordenada = /\d/.test(m[2]);
          itens.push({ recuo: recuoDe(m[1]), ordenada, numero: ordenada ? parseInt(m[2], 10) : 1, texto: m[3] });
        } else if (/^[ \t]+\S/.test(linhas[j])) {
          itens[itens.length - 1].texto += "\n" + linhas[j].trim(); // continuação do item, com recuo
        } else if (linhas[j].trim() === "" && j + 1 < linhas.length && ITEM_LISTA.test(linhas[j + 1])) {
          // linha em branco entre dois itens: a lista continua
        } else break;
        j++;
      }
      if (j < linhas.length && linhas[j].trim() === "") j++; // a lista já separa o que vem a seguir
      i = j - 1;
      for (const lista of montarListas(itens)) partes.push(<ListaMd key={partes.length} lista={lista} />);
      continue;
    }
    if (l.includes("|") && i + 1 < linhas.length && linhas[i + 1].includes("|") && SEPARADOR_TABELA.test(linhas[i + 1])) {
      despejar();
      const cabecalho = celulas(l);
      const corpo: string[][] = [];
      let j = i + 2;
      while (j < linhas.length && linhas[j].includes("|") && linhas[j].trim() !== "") corpo.push(celulas(linhas[j++]));
      if (j < linhas.length && linhas[j].trim() === "") j++; // a tabela já separa o que vem a seguir
      i = j - 1;
      partes.push(
        <div className="tabela" key={partes.length}>
          <table>
            <thead>
              <tr>
                {cabecalho.map((c, k) => (
                  <th key={k}>
                    <Negrito texto={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corpo.map((r, k) => (
                <tr key={k}>
                  {cabecalho.map((_, n) => (
                    <td key={n}>
                      <Negrito texto={r[n] ?? ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    // Título de secção ("### Certas" ou uma linha só em negrito, como "**Precisam de ajuste:**")
    const titulo = l.match(/^#{1,6}\s+(.+)$/) ?? l.match(/^\s*\*\*([^*]{1,80})\*\*:?\s*$/);
    if (titulo) {
      despejar();
      partes.push(
        <span className="sec" key={partes.length}>
          <Potencias texto={titulo[1].replace(/\*\*/g, "").trim()} />
        </span>
      );
      if (i + 1 < linhas.length && linhas[i + 1].trim() === "") i++; // o título já muda de linha
      continue;
    }
    atual.push(l);
  }
  despejar();
  return <>{partes}</>;
}

function Conteudo({ texto }: { texto: string }) {
  const blocos = texto.split(/```([\s\S]*?)```/g);
  // Um bloco de código aberto no fim (resposta ainda a chegar ou incompleta) também se mostra como código.
  const ultimo = blocos[blocos.length - 1];
  const abre = ultimo.indexOf("```");
  if (abre !== -1) blocos.splice(blocos.length - 1, 1, ultimo.slice(0, abre), ultimo.slice(abre + 3));
  // o <pre> já separa as linhas: tira a quebra de linha colada a ele, para não ficar um espaço a mais
  const semQuebraJuntoAoCodigo = (bloco: string, i: number) => {
    let t = bloco;
    if (i > 0) t = t.replace(/^\n/, "");
    if (i < blocos.length - 1) t = t.replace(/\n$/, "");
    return t;
  };
  return (
    <>
      {blocos.map((bloco, i) =>
        i % 2 === 1 ? (
          <pre key={i}>{bloco.replace(/^[\w+-]*[ \t]*\n/, "").replace(/\n$/, "")}</pre>
        ) : (
          <Texto key={i} texto={semQuebraJuntoAoCodigo(bloco, i)} />
        )
      )}
    </>
  );
}

export default function ChatPage() {
  const [pronto, setPronto] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [limite, setLimite] = useState<number | null>(null);
  const [extraDeOntem, setExtraDeOntem] = useState(0); // trocas de hoje que sobraram de ontem

  // chats (guardados neste aparelho, por código de acesso)
  const [chats, setChats] = useState<Chat[]>([]);
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [menuPerfil, setMenuPerfil] = useState(false);
  const perfilRef = useRef<HTMLDivElement>(null);
  const [filtro, setFiltro] = useState("Todas");

  const [texto, setTexto] = useState("");
  const [carregandoId, setCarregandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<{ id: string; msg: string } | null>(null);
  // resposta a chegar em streaming (inicio = texto já guardado, quando é uma continuação)
  const [aEscrever, setAEscrever] = useState<{ id: string; inicio: string; novo: string } | null>(null);
  const [tatil, setTatil] = useState(false); // telemóvel/tablet: o Enter faz nova linha
  const pararRef = useRef<AbortController | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  // código de acesso
  const [codigoInput, setCodigoInput] = useState("");
  const [erroCodigo, setErroCodigo] = useState("");
  const [aVerificar, setAVerificar] = useState(false);

  // formulário inicial / novo chat
  const [area, setArea] = useState("Matemática"); // OUTRA_AREA = escrever
  const [areaOutra, setAreaOutra] = useState("");
  const [temaSel, setTemaSel] = useState(""); // "" = sem tema (o Cold sugere), OUTRO_TEMA = escrever
  const [temaOutro, setTemaOutro] = useState("");
  const [nivel, setNivel] = useState("");
  const [objSel, setObjSel] = useState("");
  const [objOutro, setObjOutro] = useState("");
  const [ritmo, setRitmo] = useState("");
  // limiteOk = o servidor confirmou o limite de hoje (sem isso, o chat fica bloqueado)
  const [limiteOk, setLimiteOk] = useState(false);
  // bloqueio = assinatura terminada ou código desativado (o código fica guardado; ao renovar, volta a funcionar)
  const [bloqueio, setBloqueio] = useState("");
  const [nomeAluno, setNomeAluno] = useState("");
  const [assinatura, setAssinatura] = useState<{ plano: string | null; validoAte: string | null; diasRestantes: number | null } | null>(null);
  const [erroLimite, setErroLimite] = useState("");

  // conta Google (opcional): guarda os chats na Supabase para os veres em qualquer aparelho
  const [conta, setConta] = useState<Conta | null>(null);
  const [semPlano, setSemPlano] = useState<{ testeAberto: boolean } | null>(null);
  const [sincronizadoPara, setSincronizadoPara] = useState<string | null>(null);
  const [erroSync, setErroSync] = useState("");
  const [erroSemPlano, setErroSemPlano] = useState("");
  const [codigoSemPlano, setCodigoSemPlano] = useState("");
  const [aAtivar, setAAtivar] = useState(false);
  const enviadas = useRef(new Map<string, string>()); // assinatura do que já está guardado na conta
  const sincronizando = useRef(false);
  const chatsRef = useRef<Chat[]>([]);
  const contaRef = useRef<Conta | null>(null);
  const sincRef = useRef<string | null>(null);
  chatsRef.current = chats;
  contaRef.current = conta;
  sincRef.current = sincronizadoPara;
  // "chave" = quem está dentro (conta ou código); é com ela que se guardam os chats neste aparelho
  const chave = conta ? `u:${conta.userId}` : codigo;
  const quemAtual = (): Quem | null => (conta ? { tipo: "conta" } : codigo ? { tipo: "codigo", codigo } : null);

  const chat = chats.find((c) => c.id === ativoId) ?? null;
  const perfil = chat?.perfil ?? null;
  const msgs = chat?.msgs ?? [];

  function limparSessaoLocal() {
    setConta(null);
    setCodigo(null);
    setRestantes(null);
    setLimite(null);
    setExtraDeOntem(0);
    setAssinatura(null);
    setNomeAluno("");
    setBloqueio("");
    setSemPlano(null);
    setLimiteOk(false);
    setSincronizadoPara(null);
    setErroSync("");
    setMenuAberto(false);
  }

  // Pergunta ao servidor quantas trocas restam hoje. Nunca "assume" que há trocas se a resposta falhar.
  async function atualizarLimite(quem: Quem) {
    try {
      const res = await chamar("/api/acesso", quem);
      const d = await res.json().catch(() => null);
      if (res.status === 401) {
        if (quem.tipo === "conta") {
          limparSessaoLocal();
          void sairDaConta().catch(() => {});
          setErroCodigo("A tua sessão terminou. Entra outra vez.");
        } else {
          apagarStorage(CODIGO_KEY);
          setCodigo(null);
          setLimiteOk(false);
        }
        return;
      }
      if (res.status === 403 && d && d.ligado && quem.tipo === "codigo") {
        // o código passou para uma conta: só se entra com o Google
        apagarStorage(CODIGO_KEY);
        setCodigo(null);
        setLimiteOk(false);
        setErroCodigo(d.error ?? "Este código já está ligado a uma conta.");
        return;
      }
      if (res.status === 403 && d && (d.expirado || d.inativo || d.agendado)) {
        setSemPlano(null);
        setBloqueio(d.error ?? "O teu acesso está suspenso.");
        setLimiteOk(false);
        setErroLimite("");
        return;
      }
      if (res.ok && d && d.semPlano) {
        setSemPlano({ testeAberto: Boolean(d.testeAberto) });
        setBloqueio("");
        setAssinatura(null);
        setLimiteOk(false);
        setErroLimite("");
        return;
      }
      if (!res.ok || !d) throw new Error("falhou");
      setSemPlano(null);
      setRestantes(d.restantes ?? null);
      setLimite(d.limite ?? null);
      setExtraDeOntem(d.extraDeOntem ?? 0);
      setAssinatura(d.plano ? { plano: d.plano, validoAte: d.validoAte ?? null, diasRestantes: d.diasRestantes ?? null } : null);
      setNomeAluno(typeof d.nome === "string" ? d.nome : "");
      setBloqueio("");
      setLimiteOk(true);
      setErroLimite("");
    } catch {
      setLimiteOk(false);
      setErroLimite("Não consegui verificar quantas trocas ainda tens hoje.");
    }
  }

  // ao abrir a página: há sessão Google? senão, há um código guardado?
  useEffect(() => {
    (async () => {
      let c: Conta | null = null;
      if (CONTAS_ATIVAS) {
        try {
          c = contaDaSessao(await sessaoAtual());
        } catch {
          c = null;
        }
      }
      if (c) {
        setConta(c);
        await atualizarLimite({ tipo: "conta" });
      } else {
        const guardado = lerStorage<string>(CODIGO_KEY);
        if (guardado) {
          setCodigo(guardado);
          await atualizarLimite({ tipo: "codigo", codigo: guardado });
        }
      }
      setPronto(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // se a sessão terminar noutro separador
  useEffect(() => {
    const c = supabaseCliente();
    if (!c) return;
    const { data } = c.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") limparSessaoLocal();
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ao voltar à aba (ou depois da meia-noite), confirma o limite e sincroniza; ao sair da aba, guarda o que falta
  useEffect(() => {
    if (!chave) return;
    const f = () => {
      if (document.visibilityState === "visible") {
        const q = quemAtual();
        if (q) atualizarLimite(q);
        if (contaRef.current) void sincronizar();
      } else if (contaRef.current) {
        void enviarPendentes();
      }
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  // carrega os chats do código (e migra a conversa do formato antigo, se existir)
  useEffect(() => {
    enviadas.current.clear();
    setSincronizadoPara(null);
    if (!chave) {
      setChats([]);
      setAtivoId(null);
      setCarregadoPara(null);
      return;
    }
    let lista = lerStorage<Chat[]>(chatsKey(chave));
    if (!lista) {
      lista = [];
      const pAntigo = lerStorage<Perfil>(PERFIL_KEY);
      const mAntigo = lerStorage<Msg[]>(MSGS_KEY);
      if (pAntigo && !conta) {
        const agora = Date.now();
        const primeira = (mAntigo ?? []).find((m) => m.role === "user" && !m.hidden);
        lista.push({
          id: novoId(),
          titulo: primeira ? tituloDe(primeira.content) : "Novo chat",
          tituloDefinido: true,
          perfil: pAntigo,
          msgs: mAntigo ?? [],
          criado: agora,
          atualizado: agora,
        });
      }
      apagarStorage(PERFIL_KEY);
      apagarStorage(MSGS_KEY);
    }
    const guardadoAtivo = lerStorage<string>(ativoKey(chave));
    const maisRecente = [...lista].sort((a, b) => b.atualizado - a.atualizado)[0];
    const ativo = lista.find((c) => c.id === guardadoAtivo)?.id ?? maisRecente?.id ?? null;
    setChats(lista);
    setAtivoId(ativo);
    setMostrarForm(false);
    setErro(null);
    setCarregadoPara(chave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  // guarda sempre que algo muda (só depois de carregar os chats do código certo)
  useEffect(() => {
    if (!chave || carregadoPara !== chave) return;
    gravarStorage(chatsKey(chave), chats);
    gravarStorage(ativoKey(chave), ativoId);
  }, [chats, ativoId, carregadoPara, chave]);

  // se o chat ativo desaparecer (apagado noutro aparelho), passa para o mais recente
  useEffect(() => {
    if (ativoId && !chats.some((c) => c.id === ativoId)) {
      setAtivoId([...chats].sort((a, b) => b.atualizado - a.atualizado)[0]?.id ?? null);
    }
  }, [chats, ativoId]);

  // ---------- sincronização com a conta ----------
  async function enviarApagados(k: string): Promise<void> {
    const pend = lerStorage<{ id: string; atualizado: number }[]>(apagarKey(k)) ?? [];
    const ficam: { id: string; atualizado: number }[] = [];
    for (const p of pend) {
      try {
        const r = await apiChats("", { acao: "apagar", id: p.id, atualizado: p.atualizado });
        if (!r.ok) ficam.push(p);
      } catch {
        ficam.push(p);
      }
    }
    if (ficam.length) gravarStorage(apagarKey(k), ficam);
    else apagarStorage(apagarKey(k));
  }

  async function sincronizar() {
    const c = contaRef.current;
    if (!c || sincronizando.current) return;
    sincronizando.current = true;
    const k = `u:${c.userId}`;
    try {
      await enviarApagados(k);
      const r = await apiChats("");
      if (r.status === 401) {
        limparSessaoLocal();
        setErroCodigo("A tua sessão terminou. Entra outra vez.");
        return;
      }
      if (!r.ok) throw new Error("falhou");
      const { chats: metas } = (await r.json()) as { chats: { id: string; titulo: string; atualizado: number; apagado: boolean }[] };
      const dec = decidirSync(chatsRef.current, metas);
      const baixados: Chat[] = [];
      for (const id of dec.baixar) {
        const rr = await apiChats(`?id=${encodeURIComponent(id)}`);
        if (rr.ok) baixados.push(((await rr.json()) as { chat: Chat }).chat);
      }
      if (contaRef.current?.userId !== c.userId) return; // entretanto trocou de conta
      for (const id of dec.remover) enviadas.current.delete(id);
      for (const id of dec.iguais) {
        const loc = chatsRef.current.find((x) => x.id === id);
        if (loc) enviadas.current.set(id, assinaturaChat(loc));
      }
      for (const b of baixados) enviadas.current.set(b.id, assinaturaChat(b));
      setChats((prev) => {
        const mapa = new Map(prev.filter((x) => !dec.remover.includes(x.id)).map((x) => [x.id, x]));
        for (const b of baixados) {
          const atual = mapa.get(b.id);
          if (!atual || b.atualizado >= atual.atualizado) mapa.set(b.id, b);
        }
        return Array.from(mapa.values());
      });
      setSincronizadoPara(k);
      setErroSync("");
    } catch {
      setErroSync("Não consegui sincronizar agora. Tento de novo quando possível.");
    } finally {
      sincronizando.current = false;
    }
  }

  async function enviarPendentes() {
    const c = contaRef.current;
    if (!c || sincRef.current !== `u:${c.userId}`) return;
    let precisaSync = false;
    for (const ch of chatsRef.current.filter((x) => enviadas.current.get(x.id) !== assinaturaChat(x))) {
      const sig = assinaturaChat(ch);
      try {
        const r = await apiChats("", { acao: "guardar", chat: ch });
        if (r.ok) {
          enviadas.current.set(ch.id, sig);
          const d = (await r.json()) as { resultado?: string };
          if (d.resultado === "antigo" || d.resultado === "apagado") precisaSync = true;
          setErroSync("");
        } else {
          const d = await r.json().catch(() => ({}));
          if (r.status === 400 || r.status === 409) enviadas.current.set(ch.id, sig); // não insistir
          setErroSync((d as { error?: string }).error ?? "Não consegui guardar um chat na conta.");
        }
      } catch {
        setErroSync("Sem ligação: guardo as conversas na conta mais tarde.");
      }
    }
    if (precisaSync) void sincronizar();
  }

  // depois de carregar os chats deste aparelho, junta com os da conta
  useEffect(() => {
    if (conta && carregadoPara === `u:${conta.userId}`) void sincronizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta?.userId, carregadoPara]);

  // guarda na conta o que mudou (um instante depois de parares de escrever)
  useEffect(() => {
    if (!conta || sincronizadoPara !== `u:${conta.userId}`) return;
    if (!chats.some((c) => enviadas.current.get(c.id) !== assinaturaChat(c))) return;
    const t = setTimeout(() => void enviarPendentes(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, conta, sincronizadoPara]);

  useEffect(() => {
    fim.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [chat?.msgs, carregandoId, ativoId]);

  // enquanto o texto chega, acompanha o fim só se o aluno já estiver lá em baixo (não o arrasta se estiver a ler acima)
  useEffect(() => {
    const el = corpo.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [aEscrever?.novo]);

  // o menu de perfil fecha ao tocar fora dele, com Esc, ou quando a barra lateral fecha
  useEffect(() => {
    if (!menuPerfil) return;
    const fora = (e: PointerEvent) => {
      if (!perfilRef.current?.contains(e.target as Node)) setMenuPerfil(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuPerfil(false);
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuPerfil]);

  useEffect(() => {
    if (!menuAberto) setMenuPerfil(false);
  }, [menuAberto]);

  useEffect(() => {
    try {
      setTatil(window.matchMedia("(pointer: coarse)").matches);
    } catch {
      setTatil(false);
    }
  }, []);

  // o campo cresce com o texto até cerca de 6 linhas
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    const altura = el.scrollHeight + 2; // + bordas
    el.style.height = `${Math.min(altura, ALTURA_MAX_CAMPO)}px`;
    el.style.overflowY = altura > ALTURA_MAX_CAMPO ? "auto" : "hidden";
  }, [texto, ativoId, mostrarForm]);

  function atualizarChat(id: string, fn: (c: Chat) => Chat) {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    const c = codigoInput.trim().toUpperCase();
    if (!c) return;
    setErroCodigo("");
    setAVerificar(true);
    try {
      const res = await chamar("/api/acesso", { tipo: "codigo", codigo: c });
      const d = await res.json();
      if (res.status === 403 && (d.expirado || d.inativo || d.agendado)) {
        // o código é válido mas está suspenso: entra, com o aviso e o link para renovar
        gravarStorage(CODIGO_KEY, c);
        setCodigo(c);
        setBloqueio(d.error);
        setLimiteOk(false);
        setCodigoInput("");
        return;
      }
      if (!res.ok) throw new Error(d.error ?? "Código inválido.");
      gravarStorage(CODIGO_KEY, c);
      setCodigo(c);
      setRestantes(d.restantes ?? null);
      setLimite(d.limite ?? null);
      setExtraDeOntem(d.extraDeOntem ?? 0);
      setAssinatura(d.plano ? { plano: d.plano, validoAte: d.validoAte ?? null, diasRestantes: d.diasRestantes ?? null } : null);
      setNomeAluno(typeof d.nome === "string" ? d.nome : "");
      setBloqueio("");
      setLimiteOk(true);
      setErroLimite("");
      setCodigoInput("");
    } catch (err) {
      setErroCodigo(err instanceof Error ? err.message : "Erro de ligação.");
    } finally {
      setAVerificar(false);
    }
  }

  async function sair() {
    if (conta) {
      try {
        await sairDaConta();
      } catch {
        /* sem ligação: sai na mesma deste aparelho */
      }
    }
    apagarStorage(CODIGO_KEY);
    limparSessaoLocal();
  }

  async function entrarGoogle() {
    setErroCodigo("");
    try {
      await entrarComGoogle();
    } catch {
      setErroCodigo("Não consegui abrir o Google. Tenta de novo (e abre o link no Chrome ou no Safari).");
    }
  }

  // quem já usa um código: leva-o para a conta Google (e o código passa a ser só dessa conta)
  async function guardarNaConta() {
    if (codigo) gravarStorage("cold:ligar", codigo);
    await entrarGoogle();
  }

  async function criarTesteConta() {
    setErroSemPlano("");
    setAAtivar(true);
    try {
      const t = await tokenAtual();
      const r = await fetch("/api/conta/teste", { method: "POST", headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro.");
      await atualizarLimite({ tipo: "conta" });
    } catch (e) {
      setErroSemPlano(e instanceof Error ? e.message : "Erro de ligação.");
    } finally {
      setAAtivar(false);
    }
  }

  async function ligarCodigo(cod: string) {
    setErroSemPlano("");
    setAAtivar(true);
    try {
      const t = await tokenAtual();
      const r = await fetch("/api/conta/codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ codigo: cod }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro.");
      // traz para a conta as conversas que este aparelho tinha com esse código
      const locais = lerStorage<Chat[]>(chatsKey(cod));
      if (locais && locais.length > 0) {
        setChats((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          return [...prev, ...locais.filter((x) => !ids.has(x.id))];
        });
        apagarStorage(chatsKey(cod));
        apagarStorage(ativoKey(cod));
      }
      apagarStorage(CODIGO_KEY);
      setCodigoSemPlano("");
      await atualizarLimite({ tipo: "conta" });
    } catch (e) {
      setErroSemPlano(e instanceof Error ? e.message : "Erro de ligação.");
    } finally {
      setAAtivar(false);
    }
  }

  // quem entrou a partir da página /pagar volta para lá
  useEffect(() => {
    if (!conta) return;
    const destino = lerStorage<string>("cold:destino");
    if (destino) {
      apagarStorage("cold:destino");
      if (destino === "/pagar") window.location.assign(destino);
    }
  }, [conta]);

  // depois de entrar com o Google: continua o que a pessoa queria (ligar o código que já tinha, ou o teste grátis)
  useEffect(() => {
    if (!conta || !semPlano) return;
    const lig = lerStorage<string>("cold:ligar");
    const acao = lerStorage<string>("cold:acao");
    if (lig) {
      apagarStorage("cold:ligar");
      apagarStorage("cold:acao");
      void ligarCodigo(lig);
    } else if (acao === "teste") {
      apagarStorage("cold:acao");
      if (semPlano.testeAberto) void criarTesteConta();
      else setErroSemPlano("Os testes grátis estão fechados de momento. Podes ver as assinaturas.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, semPlano]);

  function aplicarRestantes(d: { restantes?: number | null; limite?: number | null; extraDeOntem?: number }) {
    if (d.restantes === undefined) return;
    setRestantes(d.restantes);
    setLimite(d.limite ?? null);
    setExtraDeOntem(d.extraDeOntem ?? 0);
    setLimiteOk(true);
    setErroLimite("");
  }

  // continuar = pedir o resto de uma resposta incompleta (a última mensagem do histórico é do Cold).
  // Devolve true se chegou alguma resposta (mesmo incompleta).
  async function pedirResposta(historico: Msg[], perfilAtual: Perfil, chatId: string, continuar = false): Promise<boolean> {
    setErro(null);
    setCarregandoId(chatId);
    const parar = new AbortController();
    pararRef.current = parar;
    const inicio = continuar ? historico[historico.length - 1].content : "";
    const anteriores = continuar ? historico.slice(0, -1) : historico;
    let novo = "";
    const guardar = (conteudo: string, incompleta: boolean) =>
      atualizarChat(chatId, (c) => ({
        ...c,
        msgs: [...anteriores, { role: "assistant", content: conteudo, ...(incompleta ? { incompleta: true } : {}) }],
        atualizado: Date.now(),
      }));
    try {
      const quem = quemAtual();
      if (!quem) throw new Error("Entra primeiro com o teu Google ou o teu código.");
      const res = await chamar(
        "/api/chat",
        quem,
        {
          messages: historico.map((m) => ({ role: m.role, content: m.content })),
          perfil: { ...perfilAtual, memoria: undefined }, // os registos vão resumidos em "memoria"
          // o que o Cold já sabe do aluno nesta área, de todas as aulas (incluindo esta)
          memoria: memoriaDaArea(chatsRef.current, perfilAtual.area),
          ...(continuar ? { continuar: true } : {}),
        },
        parar.signal
      );

      // Erros antes de o Cold começar a responder vêm em JSON, com o código HTTP.
      if (!(res.headers.get("content-type") ?? "").includes("ndjson")) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && data.sessaoInvalida) {
          limparSessaoLocal();
          void sairDaConta().catch(() => {});
          setErroCodigo("A tua sessão terminou. Entra outra vez.");
          return false;
        }
        if (res.status === 403 && data.semPlano) {
          await atualizarLimite({ tipo: "conta" });
          return false;
        }
        if (res.status === 403 && data.ligado) {
          apagarStorage(CODIGO_KEY);
          setCodigo(null);
          setErroCodigo(data.error);
          return false;
        }
        if (res.status === 401 && data.codigoInvalido) {
          apagarStorage(CODIGO_KEY);
          setCodigo(null);
          setErroCodigo("O teu código deixou de ser válido. Introduz outro.");
          return false;
        }
        if (res.status === 403 && (data.expirado || data.inativo || data.agendado)) {
          setBloqueio(data.error ?? "O teu acesso está suspenso.");
          setLimiteOk(false);
          return false;
        }
        aplicarRestantes(data);
        throw new Error(data.error ?? "Erro desconhecido.");
      }

      // A resposta chega aos pedaços (uma linha JSON por evento).
      setAEscrever({ id: chatId, inicio, novo: "" });
      const leitor = res.body!.getReader();
      const dec = new TextDecoder();
      let resto = "";
      let final: {
        reply: string;
        estado?: Estado | null;
        memoria?: { t: TipoMemoria; x: string }[];
        completa: boolean;
      } | null = null;
      let erroStream = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const ev = JSON.parse(linha);
          if (ev.t === "texto") {
            novo += ev.v;
            setAEscrever({ id: chatId, inicio, novo });
          } else if (ev.t === "fim") {
            final = ev;
            aplicarRestantes(ev);
          } else if (ev.t === "erro") {
            erroStream = ev.error;
            aplicarRestantes(ev);
          }
        }
      }
      // Sem o evento "fim", a resposta não está concluída (erro no servidor ou ligação cortada).
      if (!final || !final.reply.trim()) throw new Error(erroStream || "A ligação caiu a meio da resposta.");
      guardar(final.reply, !final.completa);
      const estado = final.estado;
      if (estado) atualizarChat(chatId, (c) => ({ ...c, perfil: atualizarPerfil(c.perfil, estado) }));
      // o que o tutor aprendeu sobre o aluno fica no perfil deste chat (e passa para as próximas aulas)
      const em = Date.now();
      const novos: RegistoMemoria[] = (final.memoria ?? []).map((r, i) => ({ t: r.t, x: r.x, em: em + i }));
      if (novos.length) {
        atualizarChat(chatId, (c) => ({
          ...c,
          perfil: { ...c.perfil, memoria: [...(c.perfil.memoria ?? []), ...novos].slice(-MAX_REGISTOS_POR_CHAT) },
        }));
      }
      return true;
    } catch (e) {
      // Se já tinha chegado texto, guarda-o como incompleto (aviso + "Continuar") em vez de o perder.
      if (novo.trim() !== "") {
        guardar(semEstado(inicio + novo).trimEnd(), true);
        return true;
      }
      if (!parar.signal.aborted) setErro({ id: chatId, msg: e instanceof Error ? e.message : "Erro de ligação." });
      return false;
    } finally {
      setCarregandoId(null);
      setAEscrever(null);
      pararRef.current = null;
    }
  }

  function enviar(conteudo: string, chatId: string, perfilAtual: Perfil, historico: Msg[], oculta = false) {
    const novas: Msg[] = [...historico, { role: "user", content: conteudo, hidden: oculta }];
    atualizarChat(chatId, (c) => ({
      ...c,
      msgs: novas,
      atualizado: Date.now(),
      ...(!oculta && !c.tituloDefinido ? { titulo: tituloDe(conteudo), tituloDefinido: true } : {}),
    }));
    return pedirResposta(novas, perfilAtual, chatId);
  }

  function comecar(e: React.FormEvent) {
    e.preventDefault();
    const novo: Perfil = {
      area: (area === OUTRA_AREA ? areaOutra : area).trim(),
      nivel_atual: nivel.trim(),
      objetivo: (objSel === OUTRO_OBJ ? objOutro : objSel).trim(),
      ritmo_semanal: ritmo.trim(),
      modulo_atual: "",
      licao_atual: "",
      dificuldades_recentes: "",
      fase_atual: "diagnostico", // toda a aula começa pelo diagnóstico
    };
    const agora = Date.now();
    const id = novoId();
    const t = (temaSel === OUTRO_TEMA ? temaOutro : temaSel).trim();
    setChats((prev) => [
      {
        id,
        titulo: t ? tituloDe(t) : "Novo chat",
        tituloDefinido: t !== "",
        perfil: novo,
        msgs: [],
        criado: agora,
        atualizado: agora,
      },
      ...prev,
    ]);
    setTemaSel("");
    setTemaOutro("");
    setAtivoId(id);
    setMostrarForm(false);
    setMenuAberto(false);
    setErro(null);
    // Com tema, a primeira mensagem é visível; sem tema, o Cold começa pelo diagnóstico.
    enviar(t ? `Quero estudar: ${t}` : PRIMEIRA_MENSAGEM, id, novo, [], t === "");
  }

  async function submeter() {
    const t = texto.trim();
    if (!t || carregandoId || !perfil || !chat || restantes === 0 || !limiteOk) return;
    const id = chat.id;
    setTexto("");
    const ok = await enviar(t, id, perfil, msgs);
    if (!ok) {
      // o envio falhou: tira a mensagem do chat e devolve o texto ao campo (junto do que entretanto se escreveu)
      atualizarChat(id, (c) => {
        const u = c.msgs[c.msgs.length - 1];
        return u && u.role === "user" && u.content === t ? { ...c, msgs: c.msgs.slice(0, -1) } : c;
      });
      setTexto((atual) => (atual.trim() ? `${t}\n${atual}` : t));
    }
  }

  function abrirNovoChat() {
    const recente = [...chats].sort((a, b) => b.atualizado - a.atualizado)[0];
    if (recente) {
      setNivel(TODOS_NIVEIS.includes(recente.perfil.nivel_atual) ? recente.perfil.nivel_atual : "");
      const o = recente.perfil.objetivo;
      if (OBJETIVOS.includes(o)) {
        setObjSel(o);
        setObjOutro("");
      } else if (o) {
        setObjSel(OUTRO_OBJ);
        setObjOutro(o);
      } else {
        setObjSel("");
        setObjOutro("");
      }
      setRitmo(RITMOS.includes(recente.perfil.ritmo_semanal) ? recente.perfil.ritmo_semanal : "");
    }
    setTemaSel("");
    setTemaOutro("");
    setMostrarForm(true);
    setMenuAberto(false);
    setMenuPerfil(false);
  }

  function selecionar(id: string) {
    setAtivoId(id);
    setMostrarForm(false);
    setMenuAberto(false);
    setMenuPerfil(false);
  }

  function renomear(c: Chat) {
    const novo = window.prompt("Novo nome do chat:", c.titulo);
    if (novo === null) return;
    const t = novo.trim().slice(0, 60);
    if (!t) return;
    atualizarChat(c.id, (x) => ({ ...x, titulo: t, tituloDefinido: true }));
  }

  function apagar(c: Chat) {
    const aviso = c.perfil.memoria?.length
      ? " O que o Cold aprendeu sobre ti nesta conversa também é esquecido."
      : "";
    if (!window.confirm(`Apagar o chat "${c.titulo}"? Não dá para desfazer.${aviso}`)) return;
    if (conta) {
      const k = `u:${conta.userId}`;
      const pend = lerStorage<{ id: string; atualizado: number }[]>(apagarKey(k)) ?? [];
      pend.push({ id: c.id, atualizado: Date.now() });
      gravarStorage(apagarKey(k), pend);
      enviadas.current.delete(c.id);
      void enviarApagados(k);
    }
    const restoChats = chats.filter((x) => x.id !== c.id);
    setChats(restoChats);
    if (c.id === ativoId) {
      const proximo = [...restoChats].sort((a, b) => b.atualizado - a.atualizado)[0];
      setAtivoId(proximo?.id ?? null);
      setMostrarForm(false);
      setErro(null);
    }
  }

  if (!pronto) return null;

  const ultima = msgs[msgs.length - 1];
  const erroAtivo = erro && erro.id === ativoId ? erro.msg : "";
  const podeTentarDeNovo = erroAtivo && ultima && ultima.role === "user" && perfil && restantes !== 0;
  const semTrocas = restantes === 0;
  const bloqueado = semTrocas || !limiteOk || bloqueio !== "";
  const aPensar = carregandoId !== null && carregandoId === ativoId;
  const mostrarFormulario = !chat || mostrarForm;
  const areaDoForm = area === OUTRA_AREA ? areaOutra.trim() : area;
  const nomePerfil = primeiroNomeLocal(conta?.nome) || nomeAluno || "Convidado";
  const planoAcaba = assinatura?.diasRestantes != null && assinatura.diasRestantes <= 3;
  // aviso ao lado do nome: o aluno tem de continuar a ver estes riscos sem abrir o menu
  const avisoPerfil =
    !conta && CONTAS_ATIVAS
      ? "Conversas só neste aparelho"
      : erroSync
      ? "Não consegui sincronizar"
      : planoAcaba
      ? `O plano termina ${assinatura!.diasRestantes! <= 1 ? "hoje" : `em ${assinatura!.diasRestantes} dias`}`
      : "";
  const escrita = aEscrever && aEscrever.id === ativoId ? aEscrever : null;
  // numa continuação, a mensagem incompleta é substituída pela bolha que está a crescer
  const msgsVisiveis = msgs.filter((m, i) => !m.hidden && !(escrita?.inicio && i === msgs.length - 1));
  const podeContinuar = ultima?.role === "assistant" && ultima.incompleta && !carregandoId && !bloqueado && perfil && chat;

  const visiveis = chats
    .filter((c) => filtro === "Todas" || c.perfil.area === filtro)
    .sort((a, b) => b.atualizado - a.atualizado);
  // Chats com o mesmo título: o 2.º (por data de criação) passa a "· 2", o 3.º a "· 3"...
  const numeroRepetido = new Map<string, number>();
  const porTitulo = new Map<string, Chat[]>();
  for (const c of chats) {
    const k = c.titulo.trim().toLowerCase();
    porTitulo.set(k, [...(porTitulo.get(k) ?? []), c]);
  }
  porTitulo.forEach((lista) => {
    if (lista.length < 2) return;
    [...lista].sort((a, b) => a.criado - b.criado).forEach((c, i) => {
      if (i > 0) numeroRepetido.set(c.id, i + 1);
    });
  });
  const grupos = GRUPOS.map((g) => ({ g, itens: visiveis.filter((c) => grupoDe(c.atualizado) === g) })).filter(
    (x) => x.itens.length > 0
  );

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <div className="header-left">
          {chave && (
            <button className="menu-btn" aria-label="Abrir menu de chats" onClick={() => setMenuAberto((v) => !v)}>
              ☰
            </button>
          )}
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cold-logo-emblem.png" alt="Cold" />
            {perfil && chave && !mostrarFormulario && <span className="sub">{perfil.area}</span>}
          </Link>
        </div>
        {chave && restantes !== null && limite !== null && (
          <div className="header-right">
            <span className="counter" title={extraDeOntem > 0 ? `${limite} trocas hoje (${extraDeOntem} vieram de ontem)` : undefined}>
              Trocas de hoje: {restantes}/{limite}
              {extraDeOntem > 0 && (
                <>
                  <span className="counter-longo"> ({extraDeOntem} vieram de ontem)</span>
                  <span className="counter-curto"> (+{extraDeOntem} de ontem)</span>
                </>
              )}
            </span>
          </div>
        )}
      </header>

      <div className="chat-main">
        {chave && (
          <>
            {menuAberto && <div className="sidebar-overlay" onClick={() => setMenuAberto(false)} />}
            <aside className={`sidebar${menuAberto ? " open" : ""}`} aria-label="Os teus chats">
              <button className="btn sidebar-new" onClick={abrirNovoChat}>
                + Novo chat
              </button>
              <div className="filters">
                {["Todas", ...Array.from(new Set(chats.map((c) => c.perfil.area)))].map((f) => (
                  <button
                    key={f}
                    className={`filter${filtro === f ? " ativo" : ""}`}
                    onClick={() => setFiltro(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <nav className="chat-list">
                {grupos.length === 0 && (
                  <p className="empty">Ainda não tens chats{filtro !== "Todas" ? ` de ${filtro}` : ""}.</p>
                )}
                {grupos.map(({ g, itens }) => (
                  <div key={g}>
                    <div className="group-title">{g}</div>
                    {itens.map((c) => (
                      <div key={c.id} className={`chat-item${c.id === ativoId && !mostrarForm ? " ativo" : ""}`}>
                        <button className="chat-item-main" onClick={() => selecionar(c.id)} title={c.titulo}>
                          <span className="t">
                            {c.titulo}
                            {numeroRepetido.get(c.id) ? ` · ${numeroRepetido.get(c.id)}` : ""}
                          </span>
                          <span className="a">
                            {c.perfil.area} · {quandoFoi(c.atualizado)}
                          </span>
                        </button>
                        <button className="icon-btn" aria-label={`Renomear ${c.titulo}`} onClick={() => renomear(c)}>
                          ✎
                        </button>
                        <button className="icon-btn" aria-label={`Apagar ${c.titulo}`} onClick={() => apagar(c)}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </nav>
              {/* Conta: uma linha compacta; as opções abrem num menu (no máximo 2 toques). */}
              <div className="sidebar-foot perfil" ref={perfilRef}>
                {menuPerfil && (
                  <div className="perfil-menu" role="menu" aria-label="Conta">
                    {conta ? (
                      <p className="plano-info">
                        Conta: {conta.email}
                        <br />
                        {erroSync ? (
                          <span className="alerta">{erroSync}</span>
                        ) : sincronizadoPara === `u:${conta.userId}` ? (
                          "☁ Conversas guardadas na tua conta"
                        ) : (
                          "A sincronizar as tuas conversas…"
                        )}
                      </p>
                    ) : CONTAS_ATIVAS ? (
                      <>
                        <p className="plano-info alerta">⚠ As tuas conversas só ficam neste aparelho.</p>
                        <button className="btn btn-ghost" type="button" role="menuitem" onClick={guardarNaConta}>
                          Guardar na minha conta Google
                        </button>
                      </>
                    ) : null}
                    {assinatura?.plano && (
                      <p className={`plano-info${planoAcaba ? " alerta" : ""}`}>
                        Plano {assinatura.plano}
                        {assinatura.validoAte ? ` · até ${formatarData(assinatura.validoAte)}` : ""}
                        {planoAcaba
                          ? ` (termina ${assinatura.diasRestantes! <= 1 ? "hoje" : `em ${assinatura.diasRestantes} dias`})`
                          : ""}
                      </p>
                    )}
                    <Link href="/pagar" className="btn btn-ghost" role="menuitem">
                      Planos e pagamento
                    </Link>
                    <InstalarApp />
                    <button className="btn btn-ghost" role="menuitem" onClick={sair}>
                      Sair
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="perfil-linha"
                  aria-haspopup="menu"
                  aria-expanded={menuPerfil}
                  onClick={() => setMenuPerfil((v) => !v)}
                >
                  <span className="perfil-icone" aria-hidden="true">
                    {(nomePerfil[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="perfil-nome">
                    {nomePerfil}
                    {avisoPerfil && (
                      <span className="perfil-aviso">
                        <span aria-hidden="true">⚠ </span>
                        {avisoPerfil}
                      </span>
                    )}
                  </span>
                  <span className="perfil-seta" aria-hidden="true">
                    {menuPerfil ? "▾" : "▴"}
                  </span>
                </button>
              </div>
            </aside>
          </>
        )}

        <div className="chat-col">
          {chave && bloqueio && (
            <div className="aviso erro aviso-topo" role="alert">
              {bloqueio}{" "}
              <Link href="/pagar" className="btn btn-ghost">
                Ver planos e pagar
              </Link>
            </div>
          )}
          {!chave ? (
            <div className="chat-body">
              <form className="onboarding" onSubmit={entrar}>
                <h1>{CONTAS_ATIVAS ? "Entra no Cold" : "Acesso por convite"}</h1>
                <p>
                  {CONTAS_ATIVAS
                    ? "Entra com o teu Google e as tuas conversas ficam guardadas na tua conta, em qualquer aparelho."
                    : "O Cold está em fase piloto. Introduz o código que recebeste."}
                </p>
                {CONTAS_ATIVAS && (
                  <>
                    <button className="btn btn-google" type="button" onClick={entrarGoogle}>
                      Continuar com Google
                    </button>
                    <p className="gate-links">
                      Se abriste este link dentro do WhatsApp ou do Instagram, abre-o no Chrome ou no Safari para entrar com o Google.
                    </p>
                    <div className="divisor">
                      <span>ou entra com um código</span>
                    </div>
                  </>
                )}
                <div className="field">
                  <label htmlFor="codigo">Código de acesso</label>
                  <input
                    id="codigo"
                    required
                    autoComplete="off"
                    value={codigoInput}
                    onChange={(e) => setCodigoInput(e.target.value)}
                    placeholder="ex.: ANA-K7Q2XM"
                  />
                </div>
                {erroCodigo && <div className="error" style={{ marginBottom: 16 }}>{erroCodigo}</div>}
                <button className="btn" type="submit" disabled={aVerificar}>
                  {aVerificar ? "A verificar…" : "Entrar"}
                </button>
                <p className="gate-links">
                  Ainda não tens código? <Link href="/teste">Experimenta 7 dias grátis</Link> ou vê as{" "}
                  <Link href="/pagar">assinaturas</Link>.
                </p>
              </form>
            </div>
          ) : semPlano ? (
            <div className="chat-body">
              <div className="onboarding">
                <h1>{conta?.nome ? `Olá, ${primeiroNomeLocal(conta.nome)}!` : "Olá!"}</h1>
                <p>Para começares, escolhe como queres usar o Cold.</p>
                {erroSemPlano && (
                  <div className="error" style={{ marginBottom: 16 }}>
                    {erroSemPlano}
                  </div>
                )}
                {semPlano.testeAberto && (
                  <p>
                    <button className="btn" type="button" onClick={criarTesteConta} disabled={aAtivar}>
                      {aAtivar ? "A preparar…" : "Experimentar 7 dias grátis"}
                    </button>
                  </p>
                )}
                <p className="gate-links" style={{ marginTop: 0 }}>
                  Já pagaste? Se o teu plano foi ativado para o email {conta?.email || "do teu Google"}, verifica aqui:
                </p>
                <p>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={aAtivar}
                    onClick={async () => {
                      setAAtivar(true);
                      await atualizarLimite({ tipo: "conta" });
                      setAAtivar(false);
                    }}
                  >
                    Verificar o meu plano
                  </button>
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = codigoSemPlano.trim().toUpperCase();
                    if (c) void ligarCodigo(c);
                  }}
                >
                  <div className="field">
                    <label htmlFor="codigo-conta">Já tens um código?</label>
                    <input
                      id="codigo-conta"
                      autoComplete="off"
                      value={codigoSemPlano}
                      onChange={(e) => setCodigoSemPlano(e.target.value)}
                      placeholder="ex.: COLD-ABC23"
                    />
                  </div>
                  <button className="btn btn-ghost" type="submit" disabled={aAtivar || codigoSemPlano.trim() === ""}>
                    Ativar o meu código
                  </button>
                </form>
                <p className="gate-links">
                  <Link href="/pagar">Ver planos e como pagar</Link>
                </p>
              </div>
            </div>
          ) : mostrarFormulario ? (
            <div className="chat-body">
              <form className="onboarding" onSubmit={comecar}>
                <h1>{chats.length === 0 ? (nomeAluno || primeiroNomeLocal(conta?.nome) ? `Vamos conhecer-te, ${nomeAluno || primeiroNomeLocal(conta?.nome)}` : "Vamos conhecer-te") : "Novo chat"}</h1>
                <p>
                  {chats.length === 0
                    ? "Três respostas rápidas para o Cold ajustar o ensino a ti."
                    : "Escolhe a área e confirma os teus dados. Podes ajustá-los."}
                </p>
                <div className="field">
                  <label htmlFor="area">O que queres estudar?</label>
                  <select
                    id="area"
                    value={area}
                    onChange={(e) => {
                      setArea(e.target.value);
                      setTemaSel("");
                      setTemaOutro("");
                    }}
                  >
                    {AREAS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                    {OUTRAS_AREAS_ATIVAS && <option value={OUTRA_AREA}>Outra área (escrever)</option>}
                  </select>
                  {area === OUTRA_AREA && (
                    <input
                      id="area-outra"
                      aria-label="Escreve a tua área"
                      style={{ marginTop: 8 }}
                      required
                      value={areaOutra}
                      onChange={(e) => setAreaOutra(e.target.value)}
                      maxLength={80}
                      placeholder="ex.: Enfermagem, Sociologia, Mandarim"
                    />
                  )}
                </div>
                <MemoriaResumo area={areaDoForm} memoria={memoriaDaArea(chats, areaDoForm)} />
                <div className="field">
                  <label htmlFor="tema">Que tema queres estudar?</label>
                  <select id="tema" value={temaSel} onChange={(e) => setTemaSel(e.target.value)}>
                    <option value="">Não sei, sugere-me por onde começar</option>
                    {temasDaArea(area).map((m) => (
                      <optgroup key={m.modulo} label={m.modulo}>
                        {m.licoes.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value={OUTRO_TEMA}>Outro tema (escrever)</option>
                  </select>
                  {temaSel === OUTRO_TEMA && (
                    <input
                      id="tema-outro"
                      aria-label="Escreve o teu tema"
                      style={{ marginTop: 8 }}
                      value={temaOutro}
                      onChange={(e) => setTemaOutro(e.target.value)}
                      maxLength={200}
                      placeholder="ex.: equações do 2.º grau, ou leis de Newton"
                    />
                  )}
                </div>
                <div className="field">
                  <label htmlFor="nivel">Qual é o teu nível atual?</label>
                  <select id="nivel" required value={nivel} onChange={(e) => setNivel(e.target.value)}>
                    <option value="" disabled>
                      Escolhe o teu nível
                    </option>
                    {NIVEIS.map((g) => (
                      <optgroup key={g.grupo} label={g.grupo}>
                        {g.itens.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="obj">Qual é o teu objetivo?</label>
                  <select id="obj" required value={objSel} onChange={(e) => setObjSel(e.target.value)}>
                    <option value="" disabled>
                      Escolhe o teu objetivo
                    </option>
                    {OBJETIVOS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                    <option value={OUTRO_OBJ}>Outro objetivo (escrever)</option>
                  </select>
                  {objSel === OUTRO_OBJ && (
                    <input
                      required
                      aria-label="Escreve o teu objetivo"
                      style={{ marginTop: 8 }}
                      value={objOutro}
                      onChange={(e) => setObjOutro(e.target.value)}
                      maxLength={200}
                      placeholder="ex.: entrar em Engenharia Informática"
                    />
                  )}
                </div>
                <div className="field">
                  <label htmlFor="ritmo">Quanto tempo tens por semana?</label>
                  <select id="ritmo" required value={ritmo} onChange={(e) => setRitmo(e.target.value)}>
                    <option value="" disabled>
                      Escolhe o teu tempo
                    </option>
                    {RITMOS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="form-actions">
                  <button className="btn" type="submit" disabled={carregandoId !== null || bloqueio !== ""}>
                    Começar
                  </button>
                  {chat && (
                    <button type="button" className="btn btn-ghost" onClick={() => setMostrarForm(false)}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>
          ) : (
            <>
              {chat && <Percurso key={chat.id} tema={temaDoChat(chat)} fase={chat.perfil.fase_atual} />}
              <div className="chat-body" ref={corpo}>
                <div className="chat-inner">
                  {msgsVisiveis.map((m, i) => (
                    <div key={i} className={`row ${m.role}`}>
                      <div className={`bubble ${m.role}`}>
                        <Conteudo texto={m.content} />
                        {m.incompleta && m === ultima && !escrita && (
                          <div className="incompleta" role="status">
                            <span>A resposta ficou incompleta.</span>
                            {podeContinuar && (
                              <button className="btn btn-ghost" onClick={() => pedirResposta(msgs, perfil!, chat!.id, true)}>
                                Continuar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {escrita && semEstado(escrita.inicio + escrita.novo).trim() !== "" && (
                    <div className="row assistant">
                      <div className="bubble assistant">
                        <Conteudo texto={semEstado(escrita.inicio + escrita.novo)} />
                      </div>
                    </div>
                  )}
                  {aPensar && (!escrita || escrita.novo === "") && (
                    <div className="thinking" role="status" aria-live="polite">
                      <span className="dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="pensar-texto">O Cold está a pensar…</span>
                    </div>
                  )}
                  {erroAtivo && (
                    <div className="error">
                      <span>{erroAtivo}</span>
                      {podeTentarDeNovo && perfil && chat && (
                        <button className="btn btn-ghost" onClick={() => pedirResposta(msgs, perfil, chat.id)}>
                          Tentar de novo
                        </button>
                      )}
                    </div>
                  )}
                  <div ref={fim} />
                </div>
              </div>

              <div className="composer">
                {semTrocas && (
                  <div className="aviso" role="status">
                    Chegaste ao limite de trocas de hoje. O limite renova à meia-noite (00:00, hora de Luanda), daqui a{" "}
                    {ateMeiaNoiteLuanda()}.
                  </div>
                )}
                {!limiteOk && !semTrocas && !bloqueio && (
                  <div className="aviso erro" role="alert">
                    {erroLimite || "A verificar o teu limite de hoje…"}{" "}
                    {chave && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          const q = quemAtual();
                          if (q) void atualizarLimite(q);
                        }}
                      >
                        Tentar de novo
                      </button>
                    )}
                  </div>
                )}
                <div className="composer-inner">
                  {/* O campo nunca fica bloqueado durante a resposta: só o botão de envio. */}
                  <textarea
                    ref={campo}
                    rows={1}
                    value={texto}
                    placeholder={
                      semTrocas
                        ? "Limite de hoje atingido. Renova às 00:00 (hora de Luanda)."
                        : "Escreve a tua resposta ou pergunta…"
                    }
                    disabled={bloqueado}
                    enterKeyHint={tatil ? "enter" : "send"}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      // No computador: Enter envia, Shift+Enter faz nova linha. No telemóvel o Enter faz sempre nova linha.
                      if (e.key === "Enter" && !e.shiftKey && !tatil && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void submeter();
                      }
                    }}
                  />
                  {aPensar ? (
                    <button className="btn" onClick={() => pararRef.current?.abort()}>
                      Parar
                    </button>
                  ) : (
                    <button className="btn btn-enviar" onClick={() => void submeter()} disabled={carregandoId !== null || bloqueado || !texto.trim()}>
                      Enviar
                    </button>
                  )}
                </div>
                {!tatil && (
                  <p className="composer-dica">
                    {carregandoId && !aPensar
                      ? "Aguarda a resposta do outro chat para enviar."
                      : "Enter para enviar · Shift+Enter para nova linha"}
                  </p>
                )}
                <p className="composer-aviso">
                  {/* ‑ = hífen que não parte a linha ("pergunta-lhe" fica junto) */}
                  O Coldlearning é uma IA e pode errar. Se algo não te parecer certo, pergunta{"‑"}lhe porquê:
                  verificar também é aprender.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
