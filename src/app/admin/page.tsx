"use client";

import { useState } from "react";
import Link from "next/link";

type Linha = { codigo: string; dia: string; trocas: number; tokens_in: number; tokens_out: number };
type Precos = { entrada_usd_por_milhao: number; saida_usd_por_milhao: number };

export default function AdminPage() {
  const [codigo, setCodigo] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [precos, setPrecos] = useState<Precos | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(false);

  async function carregar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setACarregar(true);
    try {
      const res = await fetch("/api/uso", { headers: { "x-codigo": codigo.trim() } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro.");
      setLinhas(d.linhas);
      setPrecos(d.precos);
    } catch (err) {
      setLinhas(null);
      setErro(err instanceof Error ? err.message : "Erro de ligação.");
    } finally {
      setACarregar(false);
    }
  }

  const custo = (l: { tokens_in: number; tokens_out: number }) =>
    precos
      ? (l.tokens_in * precos.entrada_usd_por_milhao + l.tokens_out * precos.saida_usd_por_milhao) / 1_000_000
      : 0;

  const totalCusto = linhas ? linhas.reduce((s, l) => s + custo(l), 0) : 0;
  const totalTrocas = linhas ? linhas.reduce((s, l) => s + l.trocas, 0) : 0;
  const codigosAtivos = linhas ? new Set(linhas.map((l) => l.codigo)).size : 0;

  return (
    <div className="admin">
      <p>
        <Link href="/">← Cold</Link>
      </p>
      <h1>Uso do Cold</h1>
      <p className="muted">Últimos 14 dias. Entra com o teu código ilimitado.</p>

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
          {aCarregar ? "A carregar…" : "Ver uso"}
        </button>
      </form>

      {erro && <div className="error" style={{ marginTop: 16 }}>{erro}</div>}

      {linhas && (
        <>
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
            O custo é uma estimativa com os preços do Sonnet 5.5 (US$ {precos?.entrada_usd_por_milhao}/M de entrada e
            US$ {precos?.saida_usd_por_milhao}/M de saída). O valor real está na consola da Anthropic.
          </p>
        </>
      )}
    </div>
  );
}
