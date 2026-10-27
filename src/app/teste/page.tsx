"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CONTAS_ATIVAS, entrarComGoogle } from "../../lib/auth-cliente";

export default function TestePage() {
  const [estado, setEstado] = useState<"a-ver" | "aberto" | "fechado">("a-ver");
  const [whatsapp, setWhatsapp] = useState("");
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [armadilha, setArmadilha] = useState("");
  const [erro, setErro] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nomeCurto, setNomeCurto] = useState("");

  useEffect(() => {
    fetch("/api/teste")
      .then((r) => r.json())
      .then((d) => {
        setWhatsapp(d.whatsapp ?? "");
        setEstado(d.aberto ? "aberto" : "fechado");
      })
      .catch(() => setEstado("fechado"));
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAEnviar(true);
    try {
      const r = await fetch("/api/teste", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome, whatsapp: tel, website: armadilha }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.fechado) setEstado("fechado");
        throw new Error(d.error ?? "Erro.");
      }
      try {
        localStorage.setItem("cold:codigo", JSON.stringify(d.codigo)); // já fica pronto a entrar
      } catch {}
      setCodigo(d.codigo);
      setNomeCurto(d.nome ?? "");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de ligação.");
    } finally {
      setAEnviar(false);
    }
  }

  const wa = whatsapp ? `https://wa.me/${whatsapp}` : "";

  return (
    <div className="pagar">
      <p>
        <Link href="/">← Cold</Link>
      </p>

      {codigo ? (
        <div className="onboarding" style={{ marginTop: 16 }}>
          <h1>{nomeCurto ? `Bem-vindo, ${nomeCurto}!` : "Bem-vindo!"}</h1>
          <p>O teu teste grátis de 7 dias está pronto. Tens 8 trocas no primeiro dia e 4 nos seguintes.</p>
          <p className="muted">O teu código (guarda-o):</p>
          <p className="codigo-grande">{codigo}</p>
          <Link href="/app" className="btn">
            Começar agora
          </Link>
          <p className="muted" style={{ marginTop: 14 }}>
            Os 7 dias contam a partir do teu primeiro uso. Se mudares de telemóvel, entra com este código.
          </p>
        </div>
      ) : estado === "a-ver" ? (
        <p className="muted">A verificar…</p>
      ) : estado === "fechado" ? (
        <div className="onboarding" style={{ marginTop: 16 }}>
          <h1>Teste grátis</h1>
          <p>
            Os testes grátis estão cheios por hoje ou fechados de momento. Volta amanhã, vê os{" "}
            <Link href="/pagar">planos</Link>
            {wa ? (
              <>
                {" "}ou fala connosco por{" "}
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
      ) : CONTAS_ATIVAS ? (
        <div className="onboarding" style={{ marginTop: 16 }}>
          <h1>Experimenta grátis durante 7 dias</h1>
          <p>Entra com o teu Google e o teste começa na hora. Sem pagar nada, e as tuas conversas ficam guardadas na tua conta.</p>
          {erro && <div className="error" style={{ marginBottom: 16 }}>{erro}</div>}
          <button
            className="btn btn-google"
            type="button"
            onClick={async () => {
              setErro("");
              try {
                localStorage.setItem("cold:acao", JSON.stringify("teste"));
                await entrarComGoogle();
              } catch {
                setErro("Não consegui abrir o Google. Abre este link no Chrome ou no Safari e tenta de novo.");
              }
            }}
          >
            Continuar com Google
          </button>
          <p className="muted" style={{ marginTop: 14 }}>
            Um teste por conta. Se abriste este link dentro do WhatsApp ou do Instagram, abre-o no Chrome ou no Safari.
          </p>
        </div>
      ) : (
        <form className="onboarding" onSubmit={enviar} style={{ marginTop: 16 }}>
          <h1>Experimenta grátis durante 7 dias</h1>
          <p>Diz-nos quem és e recebes o teu código na hora. Sem pagar nada.</p>
          <div className="field">
            <label htmlFor="nome">O teu nome</label>
            <input id="nome" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Ana Silva" />
          </div>
          <div className="field">
            <label htmlFor="tel">O teu WhatsApp</label>
            <input
              id="tel"
              required
              inputMode="tel"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="ex.: 923 111 222"
            />
          </div>
          {/* campo-armadilha para robôs: as pessoas não o veem */}
          <div className="armadilha" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={armadilha} onChange={(e) => setArmadilha(e.target.value)} />
          </div>
          {erro && <div className="error" style={{ marginBottom: 16 }}>{erro}</div>}
          <button className="btn" type="submit" disabled={aEnviar}>
            {aEnviar ? "A criar o teu acesso…" : "Receber o meu código"}
          </button>
          <p className="muted" style={{ marginTop: 14 }}>
            Usamos o teu número só para te contactar sobre o Cold. Um teste por pessoa.
          </p>
        </form>
      )}
    </div>
  );
}
