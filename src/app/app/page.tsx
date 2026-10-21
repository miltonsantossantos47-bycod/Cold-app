"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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

const PERFIL_KEY = "cold:perfil";
const MSGS_KEY = "cold:mensagens";
const CODIGO_KEY = "cold:codigo";
const PRIMEIRA_MENSAGEM = "Olá! Estou pronto para começar.";

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
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  // código de acesso
  const [codigoInput, setCodigoInput] = useState("");
  const [erroCodigo, setErroCodigo] = useState("");
  const [aVerificar, setAVerificar] = useState(false);

  // formulário inicial
  const [area, setArea] = useState("Matemática");
  const [nivel, setNivel] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [ritmo, setRitmo] = useState("");

  useEffect(() => {
    (async () => {
      setPerfil(lerStorage<Perfil>(PERFIL_KEY));
      setMsgs(lerStorage<Msg[]>(MSGS_KEY) ?? []);
      const guardado = lerStorage<string>(CODIGO_KEY);
      if (guardado) {
        try {
          const res = await fetch("/api/acesso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codigo: guardado }),
          });
          if (res.ok) {
            const d = await res.json();
            setCodigo(guardado);
            setRestantes(d.restantes ?? null);
            setLimite(d.limite ?? null);
          } else if (res.status === 401) {
            apagarStorage(CODIGO_KEY);
          } else {
            setCodigo(guardado);
          }
        } catch {
          setCodigo(guardado);
        }
      }
      setPronto(true);
    })();
  }, []);

  useEffect(() => {
    if (pronto) gravarStorage(MSGS_KEY, msgs);
  }, [msgs, pronto]);

  useEffect(() => {
    if (pronto && perfil) gravarStorage(PERFIL_KEY, perfil);
  }, [perfil, pronto]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, aCarregar]);

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
  }

  async function pedirResposta(historico: Msg[], perfilAtual: Perfil) {
    setErro("");
    setACarregar(true);
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
      }
      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido.");
      setMsgs([...historico, { role: "assistant", content: data.reply }]);
      if (data.estado) setPerfil((p) => atualizarPerfil(p ?? perfilAtual, data.estado));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de ligação.");
    } finally {
      setACarregar(false);
    }
  }

  function enviar(conteudo: string, perfilAtual: Perfil, historico: Msg[], oculta = false) {
    const novas: Msg[] = [...historico, { role: "user", content: conteudo, hidden: oculta }];
    setMsgs(novas);
    return pedirResposta(novas, perfilAtual);
  }

  function comecar(e: React.FormEvent) {
    e.preventDefault();
    const novo: Perfil = {
      area,
      nivel_atual: nivel.trim(),
      objetivo: objetivo.trim(),
      ritmo_semanal: ritmo.trim(),
      modulo_atual: "",
      licao_atual: "",
      dificuldades_recentes: "",
    };
    setPerfil(novo);
    enviar(PRIMEIRA_MENSAGEM, novo, [], true);
  }

  function submeter() {
    const t = texto.trim();
    if (!t || aCarregar || !perfil || restantes === 0) return;
    setTexto("");
    enviar(t, perfil, msgs);
  }

  function recomecar() {
    if (!confirm("Apagar o teu perfil e a conversa e recomeçar do zero?")) return;
    apagarStorage(PERFIL_KEY);
    apagarStorage(MSGS_KEY);
    setPerfil(null);
    setMsgs([]);
    setErro("");
  }

  if (!pronto) return null;

  const ultima = msgs[msgs.length - 1];
  const podeTentarDeNovo = erro && ultima && ultima.role === "user" && perfil && restantes !== 0;
  const semTrocas = restantes === 0;

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cold-logo-emblem.png" alt="Cold" />
          {perfil && codigo && <span className="sub">{perfil.area}</span>}
        </Link>
        {codigo && (
          <div className="header-right">
            {restantes !== null && limite !== null && (
              <span className="counter">Trocas de hoje: {restantes}/{limite}</span>
            )}
            {perfil && (
              <button className="btn btn-ghost" onClick={recomecar}>
                Recomeçar
              </button>
            )}
            <button className="btn btn-ghost" onClick={sair}>
              Sair
            </button>
          </div>
        )}
      </header>

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
      ) : !perfil ? (
        <div className="chat-body">
          <form className="onboarding" onSubmit={comecar}>
            <h1>Vamos conhecer-te</h1>
            <p>Três respostas rápidas para o Cold ajustar o ensino a ti.</p>
            <div className="field">
              <label htmlFor="area">O que queres estudar?</label>
              <select id="area" value={area} onChange={(e) => setArea(e.target.value)}>
                <option>Matemática</option>
                <option>Física</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="nivel">Qual é o teu nível atual?</label>
              <input id="nivel" required value={nivel} onChange={(e) => setNivel(e.target.value)}
                placeholder="ex.: 10.ª classe, sei o básico de álgebra" />
            </div>
            <div className="field">
              <label htmlFor="obj">Qual é o teu objetivo?</label>
              <input id="obj" required value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                placeholder="ex.: preparar-me para Engenharia" />
            </div>
            <div className="field">
              <label htmlFor="ritmo">Quanto tempo tens por semana?</label>
              <input id="ritmo" required value={ritmo} onChange={(e) => setRitmo(e.target.value)}
                placeholder="ex.: 5 horas, sessões de 45 minutos" />
            </div>
            <button className="btn" type="submit">Começar</button>
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
              {aCarregar && <div className="thinking">O Cold está a pensar…</div>}
              {erro && (
                <div className="error">
                  <span>{erro}</span>
                  {podeTentarDeNovo && (
                    <button className="btn btn-ghost" onClick={() => pedirResposta(msgs, perfil)}>
                      Tentar de novo
                    </button>
                  )}
                </div>
              )}
              <div ref={fim} />
            </div>
          </div>

          <div className="composer">
            <div className="composer-inner">
              <textarea
                rows={2}
                value={texto}
                placeholder={
                  semTrocas ? "Atingiste o limite de hoje. Volta amanhã." : "Escreve a tua resposta ou pergunta…"
                }
                disabled={aCarregar || semTrocas}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submeter();
                  }
                }}
              />
              <button className="btn" onClick={submeter} disabled={aCarregar || semTrocas || !texto.trim()}>
                Enviar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
