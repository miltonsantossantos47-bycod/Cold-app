"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CURRICULO } from "../../lib/curriculo";
import InstalarApp from "./instalar";

type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean };

type Perfil = {
  area: string;
  nivel_atual: string;
  objetivo: string;
  ritmo_semanal: string;
  modulo_atual: string;
  licao_atual: string;
  dificuldades_recentes: string;
};

type Estado = { modulo?: string; licao?: string; dominio?: string };

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
const AREAS = ["Matemática", "Física"];
const GRUPOS = ["Hoje", "Ontem", "Últimos 7 dias", "Mais antigos"];

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
  return t.length > 40 ? t.slice(0, 40).trimEnd() + "…" : t || "Novo chat";
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
  if (estado.dominio === "com_dificuldade" && estado.licao) {
    const lista = novo.dificuldades_recentes
      ? novo.dificuldades_recentes.split(", ").filter(Boolean)
      : [];
    if (!lista.includes(estado.licao)) lista.push(estado.licao);
    novo.dificuldades_recentes = lista.slice(-5).join(", ");
  }
  return novo;
}

function Negrito({ texto }: { texto: string }) {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {partes.map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : <span key={i}>{parte}</span>))}
    </>
  );
}

function Conteudo({ texto }: { texto: string }) {
  const blocos = texto.split(/```([\s\S]*?)```/g);
  return (
    <>
      {blocos.map((bloco, i) =>
        i % 2 === 1 ? (
          <pre key={i}>{bloco.replace(/^[a-zA-Z]*\n/, "").replace(/\n$/, "")}</pre>
        ) : (
          <Negrito key={i} texto={bloco} />
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

  // chats (guardados neste aparelho, por código de acesso)
  const [chats, setChats] = useState<Chat[]>([]);
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [filtro, setFiltro] = useState("Todas");

  const [texto, setTexto] = useState("");
  const [carregandoId, setCarregandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<{ id: string; msg: string } | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  // código de acesso
  const [codigoInput, setCodigoInput] = useState("");
  const [erroCodigo, setErroCodigo] = useState("");
  const [aVerificar, setAVerificar] = useState(false);

  // formulário inicial / novo chat
  const [area, setArea] = useState("Matemática");
  const [temaSel, setTemaSel] = useState(""); // "" = sem tema (o Cold sugere), OUTRO_TEMA = escrever
  const [temaOutro, setTemaOutro] = useState("");
  const [nivel, setNivel] = useState("");
  const [objSel, setObjSel] = useState("");
  const [objOutro, setObjOutro] = useState("");
  const [ritmo, setRitmo] = useState("");
  // limiteOk = o servidor confirmou o limite de hoje (sem isso, o chat fica bloqueado)
  const [limiteOk, setLimiteOk] = useState(false);
  const [erroLimite, setErroLimite] = useState("");

  const chat = chats.find((c) => c.id === ativoId) ?? null;
  const perfil = chat?.perfil ?? null;
  const msgs = chat?.msgs ?? [];

  // Pergunta ao servidor quantas trocas restam hoje. Nunca "assume" que há trocas se a resposta falhar.
  async function atualizarLimite(c: string) {
    try {
      const res = await fetch("/api/acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: c }),
      });
      if (res.status === 401) {
        apagarStorage(CODIGO_KEY);
        setCodigo(null);
        setLimiteOk(false);
        return;
      }
      const d = await res.json().catch(() => null);
      if (!res.ok || !d) throw new Error("falhou");
      setRestantes(d.restantes ?? null);
      setLimite(d.limite ?? null);
      setLimiteOk(true);
      setErroLimite("");
    } catch {
      setLimiteOk(false);
      setErroLimite("Não consegui verificar quantas trocas ainda tens hoje.");
    }
  }

  // valida o código guardado ao abrir a página
  useEffect(() => {
    (async () => {
      const guardado = lerStorage<string>(CODIGO_KEY);
      if (guardado) {
        setCodigo(guardado);
        await atualizarLimite(guardado);
      }
      setPronto(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ao voltar à aba (ou depois da meia-noite), confirma o limite de novo
  useEffect(() => {
    if (!codigo) return;
    const f = () => {
      if (document.visibilityState === "visible") atualizarLimite(codigo);
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  // carrega os chats do código (e migra a conversa do formato antigo, se existir)
  useEffect(() => {
    if (!codigo) {
      setChats([]);
      setAtivoId(null);
      setCarregadoPara(null);
      return;
    }
    let lista = lerStorage<Chat[]>(chatsKey(codigo));
    if (!lista) {
      lista = [];
      const pAntigo = lerStorage<Perfil>(PERFIL_KEY);
      const mAntigo = lerStorage<Msg[]>(MSGS_KEY);
      if (pAntigo) {
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
    const guardadoAtivo = lerStorage<string>(ativoKey(codigo));
    const maisRecente = [...lista].sort((a, b) => b.atualizado - a.atualizado)[0];
    const ativo = lista.find((c) => c.id === guardadoAtivo)?.id ?? maisRecente?.id ?? null;
    setChats(lista);
    setAtivoId(ativo);
    setMostrarForm(false);
    setErro(null);
    setCarregadoPara(codigo);
  }, [codigo]);

  // guarda sempre que algo muda (só depois de carregar os chats do código certo)
  useEffect(() => {
    if (!codigo || carregadoPara !== codigo) return;
    gravarStorage(chatsKey(codigo), chats);
    gravarStorage(ativoKey(codigo), ativoId);
  }, [chats, ativoId, carregadoPara, codigo]);

  useEffect(() => {
    fim.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [chat?.msgs, carregandoId, ativoId]);

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
      const res = await fetch("/api/acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: c }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Código inválido.");
      gravarStorage(CODIGO_KEY, c);
      setCodigo(c);
      setRestantes(d.restantes ?? null);
      setLimite(d.limite ?? null);
      setLimiteOk(true);
      setErroLimite("");
      setCodigoInput("");
    } catch (err) {
      setErroCodigo(err instanceof Error ? err.message : "Erro de ligação.");
    } finally {
      setAVerificar(false);
    }
  }

  function sair() {
    apagarStorage(CODIGO_KEY);
    setCodigo(null);
    setRestantes(null);
    setLimite(null);
    setMenuAberto(false);
  }

  async function pedirResposta(historico: Msg[], perfilAtual: Perfil, chatId: string) {
    setErro(null);
    setCarregandoId(chatId);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historico.map((m) => ({ role: m.role, content: m.content })),
          perfil: perfilAtual,
          codigo,
        }),
      });
      const data = await res.json();
      if (res.status === 401 && data.codigoInvalido) {
        apagarStorage(CODIGO_KEY);
        setCodigo(null);
        setErroCodigo("O teu código deixou de ser válido. Introduz outro.");
        return;
      }
      if (data.restantes !== undefined) {
        setRestantes(data.restantes);
        setLimite(data.limite ?? null);
        setLimiteOk(true);
        setErroLimite("");
      }
      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido.");
      atualizarChat(chatId, (c) => ({
        ...c,
        msgs: [...historico, { role: "assistant", content: data.reply }],
        atualizado: Date.now(),
      }));
      if (data.estado) {
        atualizarChat(chatId, (c) => ({ ...c, perfil: atualizarPerfil(c.perfil, data.estado) }));
      }
    } catch (e) {
      setErro({ id: chatId, msg: e instanceof Error ? e.message : "Erro de ligação." });
    } finally {
      setCarregandoId(null);
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
      area,
      nivel_atual: nivel.trim(),
      objetivo: (objSel === OUTRO_OBJ ? objOutro : objSel).trim(),
      ritmo_semanal: ritmo.trim(),
      modulo_atual: "",
      licao_atual: "",
      dificuldades_recentes: "",
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

  function submeter() {
    const t = texto.trim();
    if (!t || carregandoId || !perfil || !chat || restantes === 0 || !limiteOk) return;
    setTexto("");
    enviar(t, chat.id, perfil, msgs);
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
  }

  function selecionar(id: string) {
    setAtivoId(id);
    setMostrarForm(false);
    setMenuAberto(false);
  }

  function renomear(c: Chat) {
    const novo = window.prompt("Novo nome do chat:", c.titulo);
    if (novo === null) return;
    const t = novo.trim().slice(0, 60);
    if (!t) return;
    atualizarChat(c.id, (x) => ({ ...x, titulo: t, tituloDefinido: true }));
  }

  function apagar(c: Chat) {
    if (!window.confirm(`Apagar o chat "${c.titulo}"? Não dá para desfazer.`)) return;
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
  const bloqueado = semTrocas || !limiteOk;
  const aPensar = carregandoId !== null && carregandoId === ativoId;
  const mostrarFormulario = !chat || mostrarForm;

  const visiveis = chats
    .filter((c) => filtro === "Todas" || c.perfil.area === filtro)
    .sort((a, b) => b.atualizado - a.atualizado);
  const grupos = GRUPOS.map((g) => ({ g, itens: visiveis.filter((c) => grupoDe(c.atualizado) === g) })).filter(
    (x) => x.itens.length > 0
  );

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <div className="header-left">
          {codigo && (
            <button className="menu-btn" aria-label="Abrir menu de chats" onClick={() => setMenuAberto((v) => !v)}>
              ☰
            </button>
          )}
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cold-logo-emblem.png" alt="Cold" />
            {perfil && codigo && !mostrarFormulario && <span className="sub">{perfil.area}</span>}
          </Link>
        </div>
        {codigo && restantes !== null && limite !== null && (
          <div className="header-right">
            <span className="counter">Trocas de hoje: {restantes}/{limite}</span>
          </div>
        )}
      </header>

      <div className="chat-main">
        {codigo && (
          <>
            {menuAberto && <div className="sidebar-overlay" onClick={() => setMenuAberto(false)} />}
            <aside className={`sidebar${menuAberto ? " open" : ""}`} aria-label="Os teus chats">
              <button className="btn sidebar-new" onClick={abrirNovoChat}>
                + Novo chat
              </button>
              <div className="filters">
                {["Todas", ...AREAS].map((f) => (
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
                          <span className="t">{c.titulo}</span>
                          <span className="a">{c.perfil.area}</span>
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
              <div className="sidebar-foot">
                <InstalarApp />
                <button className="btn btn-ghost" onClick={sair}>
                  Sair
                </button>
              </div>
            </aside>
          </>
        )}

        <div className="chat-col">
          {!codigo ? (
            <div className="chat-body">
              <form className="onboarding" onSubmit={entrar}>
                <h1>Acesso por convite</h1>
                <p>O Cold está em fase piloto. Introduz o código que recebeste.</p>
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
              </form>
            </div>
          ) : mostrarFormulario ? (
            <div className="chat-body">
              <form className="onboarding" onSubmit={comecar}>
                <h1>{chats.length === 0 ? "Vamos conhecer-te" : "Novo chat"}</h1>
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
                  </select>
                </div>
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
                  <button className="btn" type="submit" disabled={carregandoId !== null}>
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
              <div className="chat-body">
                <div className="chat-inner">
                  {msgs
                    .filter((m) => !m.hidden)
                    .map((m, i) => (
                      <div key={i} className={`row ${m.role}`}>
                        <div className={`bubble ${m.role}`}>
                          <Conteudo texto={m.content} />
                        </div>
                      </div>
                    ))}
                  {aPensar && <div className="thinking">O Cold está a pensar…</div>}
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
                {!limiteOk && !semTrocas && (
                  <div className="aviso erro" role="alert">
                    {erroLimite || "A verificar o teu limite de hoje…"}{" "}
                    {codigo && (
                      <button className="btn btn-ghost" onClick={() => atualizarLimite(codigo)}>
                        Tentar de novo
                      </button>
                    )}
                  </div>
                )}
                <div className="composer-inner">
                  <textarea
                    rows={2}
                    value={texto}
                    placeholder={
                      semTrocas
                        ? "Limite de hoje atingido. Renova às 00:00 (hora de Luanda)."
                        : carregandoId && !aPensar
                        ? "Aguarda a resposta do outro chat…"
                        : "Escreve a tua resposta ou pergunta…"
                    }
                    disabled={carregandoId !== null || bloqueado}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submeter();
                      }
                    }}
                  />
                  <button className="btn" onClick={submeter} disabled={carregandoId !== null || bloqueado || !texto.trim()}>
                    Enviar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
