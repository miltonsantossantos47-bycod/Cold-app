"use client";

import { useState } from "react";
import Link from "next/link";
import { formatarData, formatarKz } from "../../lib/planos";

type Linha = { codigo: string; dia: string; trocas: number; tokens_in: number; tokens_out: number };
type Precos = { entrada_usd_por_milhao: number; saida_usd_por_milhao: number };
type PlanoInfo = { id: string; nome: string; trocasPorDia: number; precoKz: number; dias: number; publico: boolean };
type AcessoInfo = {
  codigo: string;
  nome: string;
  contacto: string;
  plano: string;
  valido_ate: string | null;
  ativo: boolean;
  estado: "ativo" | "expirado" | "desativado" | "por iniciar";
  diasRestantes: number | null;
};
type Assinaturas = { planos: PlanoInfo[]; acessos: AcessoInfo[]; receitaKz: number; pagamentos: number };

export default function AdminPage() {
  const [codigo, setCodigo] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [precos, setPrecos] = useState<Precos | null>(null);
  const [assin, setAssin] = useState<Assinaturas | null>(null);
  const [erro, setErro] = useState("");
  const [erroAssin, setErroAssin] = useState("");
  const [aCarregar, setACarregar] = useState(false);
  const [entrou, setEntrou] = useState(false);

  // formulário "nova assinatura"
  const [nome, setNome] = useState("");
  const [contacto, setContacto] = useState("");
  const [planoId, setPlanoId] = useState("estudante");
  const [valor, setValor] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);

  const cab = { "x-codigo": codigo.trim(), "content-type": "application/json" };

  async function carregar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setErroAssin("");
    setACarregar(true);
    try {
      const [ru, ra] = await Promise.all([
        fetch("/api/uso", { headers: { "x-codigo": codigo.trim() } }),
        fetch("/api/admin/acessos", { headers: { "x-codigo": codigo.trim() } }),
      ]);
      const du = await ru.json();
      if (!ru.ok) throw new Error(du.error ?? "Erro.");
      setLinhas(du.linhas);
      setPrecos(du.precos);
      setEntrou(true);
      const da = await ra.json();
      if (ra.ok) setAssin(da);
      else {
        setAssin(null);
        setErroAssin(da.error ?? "Não consegui carregar as assinaturas.");
      }
    } catch (err) {
      setLinhas(null);
      setEntrou(false);
      setErro(err instanceof Error ? err.message : "Erro de ligação.");
    } finally {
      setACarregar(false);
    }
  }

  async function acao(corpo: Record<string, unknown>) {
    setErroAssin("");
    setAGuardar(true);
    try {
      const r = await fetch("/api/admin/acessos", { method: "POST", headers: cab, body: JSON.stringify(corpo) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro.");
      setAssin(d);
      return d as { codigo: string; acesso?: AcessoInfo };
    } catch (err) {
      setErroAssin(err instanceof Error ? err.message : "Erro de ligação.");
      return null;
    } finally {
      setAGuardar(false);
    }
  }

  function textoConvite(c: string, n: string, plano: PlanoInfo, validoAte: string | null) {
    const quando =
      plano.id === "teste"
        ? `O teu teste grátis dura ${plano.dias} dias e começa no primeiro uso.`
        : `A tua assinatura está ativa até ${formatarData(validoAte)}.`;
    return [
      `Olá ${n}! 👋 Bem-vindo(a) ao Cold (plano ${plano.nome}).`,
      "",
      `🔗 ${window.location.origin}/app`,
      `🔑 O teu código: ${c}`,
      "",
      `${quando} Tens ${plano.trocasPorDia} trocas por dia${plano.id === "teste" ? " (8 no primeiro dia)" : ""}.`,
      "Abre o link no Chrome ou no Safari e, no menu ☰, toca em «Instalar no telemóvel».",
    ].join("\n");
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const plano = assin?.planos.find((p) => p.id === planoId);
    if (!plano) return;
    const d = await acao({ acao: "criar", nome, contacto, plano: planoId, valorKz: valor === "" ? undefined : valor });
    if (d?.acesso) {
      setMensagem(textoConvite(d.codigo, nome.trim(), plano, d.acesso.valido_ate));
      setNome("");
      setContacto("");
      setValor("");
      setCopiado(false);
    }
  }

  async function renovar(a: AcessoInfo) {
    const plano = assin?.planos.find((p) => p.id === a.plano);
    const v = window.prompt(`Valor recebido em Kz (renovar ${a.nome || a.codigo}, +${plano?.dias ?? 30} dias):`, String(plano?.precoKz ?? 0));
    if (v === null) return;
    const d = await acao({ acao: "renovar", codigo: a.codigo, valorKz: v.trim() });
    if (d && plano) {
      const novo = (await fetch("/api/admin/acessos", { headers: { "x-codigo": codigo.trim() } }).then((r) => r.json()).catch(() => null)) as Assinaturas | null;
      const ate = novo?.acessos.find((x) => x.codigo === a.codigo)?.valido_ate ?? null;
      setMensagem(`Olá ${a.nome}! A tua assinatura do Cold foi renovada (plano ${plano.nome}) e está ativa até ${formatarData(ate)}. Bons estudos! 📚`);
      setCopiado(false);
    }
  }

  async function alternar(a: AcessoInfo) {
    if (a.ativo && !window.confirm(`Desativar o código ${a.codigo} (${a.nome})? A pessoa deixa de conseguir usar o Cold.`)) return;
    await acao({ acao: a.ativo ? "desativar" : "reativar", codigo: a.codigo });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  const custo = (l: { tokens_in: number; tokens_out: number }) =>
    precos ? (l.tokens_in * precos.entrada_usd_por_milhao + l.tokens_out * precos.saida_usd_por_milhao) / 1_000_000 : 0;

  const totalCusto = linhas ? linhas.reduce((s, l) => s + custo(l), 0) : 0;
  const totalTrocas = linhas ? linhas.reduce((s, l) => s + l.trocas, 0) : 0;
  const codigosAtivos = linhas ? new Set(linhas.map((l) => l.codigo)).size : 0;
  const ativos = assin ? assin.acessos.filter((a) => a.estado === "ativo").length : 0;
  const aExpirar = assin ? assin.acessos.filter((a) => a.estado === "ativo" && a.diasRestantes !== null && a.diasRestantes <= 3).length : 0;
  const planoEscolhido = assin?.planos.find((p) => p.id === planoId);

  return (
    <div className="admin">
      <p>
        <Link href="/">← Cold</Link>
      </p>
      <h1>Painel do Cold</h1>
      <p className="muted">Assinaturas e uso (últimos 14 dias). Entra com o teu código ilimitado.</p>

      <form onSubmit={carregar} className="admin-form">
        <input
          type="password"
          required
          autoComplete="off"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="O teu código"
        />
        <button className="btn" type="submit" disabled={aCarregar}>
          {aCarregar ? "A carregar…" : entrou ? "Atualizar" : "Entrar"}
        </button>
      </form>

      {erro && <div className="error" style={{ marginTop: 16 }}>{erro}</div>}

      {entrou && (
        <section className="admin-sec">
          <h2>Assinaturas</h2>
          {erroAssin && <div className="error" style={{ marginBottom: 12 }}>{erroAssin}</div>}
          {!assin && !erroAssin && <p className="muted">A carregar…</p>}

          {assin && (
            <>
              <div className="summary">
                <div><strong>{ativos}</strong><span>ativas</span></div>
                <div><strong>{aExpirar}</strong><span>a terminar (3 dias)</span></div>
                <div><strong>{formatarKz(assin.receitaKz)}</strong><span>recebido</span></div>
                <div><strong>{assin.pagamentos}</strong><span>pagamentos</span></div>
              </div>

              <h3 style={{ marginTop: 22 }}>Nova assinatura</h3>
              <form onSubmit={criar}>
                <div className="form-grid">
                  <input required placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} aria-label="Nome" />
                  <input placeholder="Contacto (WhatsApp)" value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={40} aria-label="Contacto" />
                  <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} aria-label="Plano">
                    {assin.planos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome} · {p.trocasPorDia}/dia · {p.precoKz === 0 ? "grátis" : formatarKz(p.precoKz)}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="numeric"
                    placeholder={`Valor recebido (Kz)${planoEscolhido ? ` — ${planoEscolhido.precoKz}` : ""}`}
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    aria-label="Valor recebido"
                  />
                </div>
                <button className="btn" type="submit" disabled={aGuardar}>
                  {aGuardar ? "A guardar…" : "Criar e gerar mensagem"}
                </button>
              </form>

              {mensagem && (
                <div>
                  <textarea className="msg-pronta" value={mensagem} onChange={(e) => setMensagem(e.target.value)} aria-label="Mensagem pronta" />
                  <button className="btn btn-ghost" onClick={copiar} type="button">
                    {copiado ? "Copiado ✓" : "Copiar mensagem"}
                  </button>
                </div>
              )}

              <h3 style={{ marginTop: 26 }}>Todas as assinaturas</h3>
              {assin.acessos.length === 0 ? (
                <p className="muted">Ainda não criaste nenhuma assinatura.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Código</th>
                        <th>Plano</th>
                        <th>Válido até</th>
                        <th>Estado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {assin.acessos.map((a) => (
                        <tr key={a.codigo}>
                          <td>{a.nome}</td>
                          <td>{a.codigo}</td>
                          <td>{assin.planos.find((p) => p.id === a.plano)?.nome ?? a.plano}</td>
                          <td>{a.valido_ate ? formatarData(a.valido_ate) : "—"}</td>
                          <td>
                            <span className={`estado ${a.estado === "por iniciar" ? "" : a.estado}`}>
                              {a.estado}
                              {a.estado === "ativo" && a.diasRestantes !== null ? ` · ${a.diasRestantes} d` : ""}
                            </span>
                          </td>
                          <td>
                            <div className="acoes">
                              <button className="btn btn-ghost" onClick={() => renovar(a)} disabled={aGuardar}>
                                Renovar
                              </button>
                              <button className="btn btn-ghost" onClick={() => alternar(a)} disabled={aGuardar}>
                                {a.ativo ? "Desativar" : "Reativar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {linhas && (
        <section className="admin-sec">
          <h2>Uso</h2>
          <div className="summary">
            <div><strong>{totalTrocas}</strong><span>trocas</span></div>
            <div><strong>{codigosAtivos}</strong><span>pessoas ativas</span></div>
            <div><strong>US$ {totalCusto.toFixed(2)}</strong><span>custo estimado</span></div>
            <div>
              <strong>US$ {totalTrocas ? (totalCusto / totalTrocas).toFixed(3) : "0.000"}</strong>
              <span>por troca</span>
            </div>
          </div>

          {linhas.length === 0 ? (
            <p className="muted">Ainda não há uso registado.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Código</th>
                    <th>Trocas</th>
                    <th>Tokens (entrada)</th>
                    <th>Tokens (saída)</th>
                    <th>Custo (US$)</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={`${l.dia}-${l.codigo}`}>
                      <td>{l.dia}</td>
                      <td>{l.codigo}</td>
                      <td>{l.trocas}</td>
                      <td>{l.tokens_in.toLocaleString("pt-PT")}</td>
                      <td>{l.tokens_out.toLocaleString("pt-PT")}</td>
                      <td>{custo(l).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ marginTop: 12 }}>
            O custo é uma estimativa com os preços do Sonnet 5.5 (US$ {precos?.entrada_usd_por_milhao}/M de entrada e US${" "}
            {precos?.saida_usd_por_milhao}/M de saída). O valor real está na consola da Anthropic.
          </p>
        </section>
      )}
    </div>
  );
}
