"use client";

import { useState } from "react";
import Link from "next/link";
import { formatarData, formatarKz } from "../../lib/planos";

type Linha = { codigo: string; dia: string; trocas: number; tokens_in: number; tokens_out: number };
type Precos = { entrada_usd_por_milhao: number; saida_usd_por_milhao: number };
type PlanoInfo = { id: string; nome: string; trocasPorDia: number; precoKz: number; dias: number; publico: boolean; criavel?: boolean };
type AcessoInfo = {
  codigo: string;
  nome: string;
  contacto: string;
  email?: string | null;
  user_id?: string | null;
  plano: string;
  valido_ate: string | null;
  ativo: boolean;
  estado: "ativo" | "expirado" | "desativado" | "por iniciar" | "agendado";
  diasRestantes: number | null;
};
type PedidoInfo = {
  ref: string;
  nome: string;
  email: string;
  tipo: string;
  trocas_dia: number;
  dias: number;
  preco_kz: number;
  quando: string;
  criado_em?: string;
};
type PagamentoInfo = { id: number; codigo: string; plano: string; valor_kz: number; dias: number; criado_em?: string };
type Assinaturas = {
  planos: PlanoInfo[];
  acessos: AcessoInfo[];
  receitaKz: number;
  pagamentos: number;
  pedidos?: PedidoInfo[];
  listaPagamentos?: PagamentoInfo[];
};
type RespAcao = {
  codigo?: string;
  acesso?: AcessoInfo & { valido_ate: string | null; email?: string | null };
  confirmacao?: { nome: string; plano: string; trocas_dia: number; inicio: string; valido_ate: string };
};

export default function AdminPage() {
  const [codigo, setCodigo] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [precos, setPrecos] = useState<Precos | null>(null);
  const [hoje, setHoje] = useState("");
  const [msgUso, setMsgUso] = useState("");
  const [assin, setAssin] = useState<Assinaturas | null>(null);
  const [erro, setErro] = useState("");
  const [erroAssin, setErroAssin] = useState("");
  const [aCarregar, setACarregar] = useState(false);
  const [entrou, setEntrou] = useState(false);

  // formulário "nova assinatura"
  const [nome, setNome] = useState("");
  const [contacto, setContacto] = useState("");
  const [emailForm, setEmailForm] = useState("");
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
      setHoje(du.hoje ?? "");
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
      return d as RespAcao;
    } catch (err) {
      setErroAssin(err instanceof Error ? err.message : "Erro de ligação.");
      return null;
    } finally {
      setAGuardar(false);
    }
  }

  async function recarregarUso() {
    const r = await fetch("/api/uso", { headers: { "x-codigo": codigo.trim() } });
    const d = await r.json();
    if (r.ok) {
      setLinhas(d.linhas);
      setPrecos(d.precos);
      setHoje(d.hoje ?? "");
    }
  }

  async function confirmarPedido(p: PedidoInfo) {
    const v = window.prompt(`Valor recebido em Kz (pedido ${p.ref} de ${p.nome}):`, String(p.preco_kz));
    if (v === null) return;
    const d = await acao({ acao: "confirmar-pedido", ref: p.ref, valorKz: v.trim() });
    if (d?.confirmacao) {
      const c = d.confirmacao;
      setMensagem(
        `Olá ${c.nome}! O teu pagamento foi confirmado ✅\nPlano ${c.plano}: ${c.trocas_dia} trocas por dia, de ${formatarData(c.inicio)} a ${formatarData(c.valido_ate)}.\nEntra em ${window.location.origin}/app com o teu Google: o plano já está na tua conta. Bons estudos! 📚`
      );
      setCopiado(false);
    }
  }

  async function cancelarPedido(p: PedidoInfo) {
    if (!window.confirm(`Cancelar o pedido ${p.ref} de ${p.nome}?`)) return;
    await acao({ acao: "cancelar-pedido", ref: p.ref });
  }

  async function apagarPagamento(p: PagamentoInfo) {
    if (!window.confirm(`Apagar o pagamento de ${formatarKz(p.valor_kz)} (${p.codigo})? O total recebido diminui.`)) return;
    await acao({ acao: "apagar-pagamento", id: p.id });
  }

  async function limparPagamentos() {
    if (
      !window.confirm(
        "Apagar TODOS os registos de pagamentos? O «recebido» e o número de pagamentos ficam a zero. As assinaturas não são afetadas. Não dá para desfazer."
      )
    )
      return;
    await acao({ acao: "limpar-pagamentos" });
  }

  async function apagar(a: AcessoInfo) {
    if (a.ativo) return;
    if (!window.confirm(`Apagar para sempre o acesso ${a.codigo} (${a.nome})? Não dá para desfazer. Os pagamentos registados ficam no total recebido.`)) return;
    await acao({ acao: "apagar", codigo: a.codigo });
  }

  async function limparUso(filtro: { codigo?: string; dia?: string }) {
    const quais = filtro.dia
      ? `o uso de ${filtro.codigo} em ${filtro.dia}`
      : "todo o histórico de uso dos dias anteriores a hoje (o de hoje fica, para os limites diários não voltarem a zero)";
    const aviso = filtro.dia
      ? ""
      : " O custo total e o custo por troca deixam de contar esses dias. Se quiseres guardar os números, tira uma captura antes.";
    if (!window.confirm(`Limpar ${quais}?${aviso} Não dá para desfazer.`)) return;
    setErroAssin("");
    setMsgUso("");
    try {
      const r = await fetch("/api/uso", { method: "POST", headers: cab, body: JSON.stringify({ acao: "limpar", ...filtro }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro.");
      setMsgUso(d.apagadas === 1 ? "Foi apagada 1 linha de uso." : `Foram apagadas ${d.apagadas} linhas de uso.`);
      await recarregarUso();
    } catch (err) {
      setMsgUso(err instanceof Error ? err.message : "Erro de ligação.");
    }
  }

  function textoConvite(c: string, n: string, plano: PlanoInfo, validoAte: string | null, email?: string | null) {
    const quando =
      plano.id === "teste"
        ? `O teu teste grátis dura ${plano.dias} dias e começa no primeiro uso.`
        : `A tua assinatura está ativa até ${formatarData(validoAte)}.`;
    const entrada = email
      ? [`📧 Entra com o Google usando este email: ${email}`, "O teu plano aparece sozinho, não precisas de código."]
      : [`🔑 O teu código: ${c}`];
    return [
      `Olá ${n}! 👋 Bem-vindo(a) ao Cold (plano ${plano.nome}).`,
      "",
      `🔗 ${window.location.origin}/app`,
      ...entrada,
      "",
      `${quando} Tens ${plano.trocasPorDia} trocas por dia${plano.id === "teste" ? " (8 no primeiro dia)" : ""}.`,
      "Abre o link no Chrome ou no Safari e, no menu ☰, toca em «Instalar no telemóvel».",
    ].join("\n");
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const plano = assin?.planos.find((p) => p.id === planoId);
    if (!plano) return;
    const d = await acao({ acao: "criar", nome, contacto, email: emailForm.trim() || undefined, plano: planoId, valorKz: valor === "" ? undefined : valor });
    if (d?.acesso) {
      setMensagem(textoConvite(d.codigo ?? "", nome.trim(), plano, d.acesso.valido_ate, d.acesso.email));
      setNome("");
      setContacto("");
      setEmailForm("");
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

              <h3 style={{ marginTop: 22 }}>Pedidos por confirmar</h3>
              {(assin.pedidos ?? []).length === 0 ? (
                <p className="muted">Nenhum pedido pendente.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Referência</th>
                        <th>Pessoa</th>
                        <th>Plano pedido</th>
                        <th>Preço</th>
                        <th>Começa</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(assin.pedidos ?? []).map((p) => (
                        <tr key={p.ref}>
                          <td>{p.ref}</td>
                          <td>
                            {p.nome}
                            <div className="muted" style={{ fontSize: 12.5 }}>{p.email}</div>
                          </td>
                          <td>
                            {p.tipo === "personalizado" ? "Personalizado" : assin.planos.find((x) => x.id === p.tipo)?.nome ?? p.tipo}
                            <div className="muted" style={{ fontSize: 12.5 }}>
                              {p.trocas_dia} trocas/dia × {p.dias} dias
                            </div>
                          </td>
                          <td>{formatarKz(p.preco_kz)}</td>
                          <td>{p.quando === "agora" ? "agora" : "depois do atual"}</td>
                          <td>
                            <div className="acoes">
                              <button className="btn" type="button" onClick={() => confirmarPedido(p)} disabled={aGuardar}>
                                Confirmar pagamento
                              </button>
                              <button className="btn btn-ghost btn-perigo" type="button" onClick={() => cancelarPedido(p)} disabled={aGuardar}>
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={{ marginTop: 26 }}>Pagamentos registados</h3>
              {(assin.listaPagamentos ?? []).length === 0 ? (
                <p className="muted">Nenhum pagamento registado.</p>
              ) : (
                <>
                  <p style={{ marginBottom: 10 }}>
                    <button className="btn btn-ghost btn-perigo" type="button" onClick={limparPagamentos} disabled={aGuardar}>
                      Limpar todos os pagamentos
                    </button>
                    <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
                      Útil para tirar os de teste. Zera o «recebido».
                    </span>
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Código</th>
                          <th>Plano</th>
                          <th>Valor</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(assin.listaPagamentos ?? []).map((p) => (
                          <tr key={p.id}>
                            <td>{p.criado_em ? p.criado_em.slice(0, 10) : ""}</td>
                            <td>{p.codigo}</td>
                            <td>{assin.planos.find((x) => x.id === p.plano)?.nome ?? p.plano}</td>
                            <td>{formatarKz(p.valor_kz)}</td>
                            <td>
                              <button className="btn btn-ghost btn-perigo" type="button" onClick={() => apagarPagamento(p)} disabled={aGuardar}>
                                Apagar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <h3 style={{ marginTop: 26 }}>Nova assinatura</h3>
              <form onSubmit={criar}>
                <div className="form-grid">
                  <input required placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} aria-label="Nome" />
                  <input placeholder="Contacto (WhatsApp)" value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={40} aria-label="Contacto" />
                  <input
                    type="email"
                    placeholder="Email do Gmail (opcional)"
                    value={emailForm}
                    onChange={(e) => setEmailForm(e.target.value)}
                    maxLength={120}
                    aria-label="Email do Gmail"
                  />
                  <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} aria-label="Plano">
                    {assin.planos.filter((p) => p.criavel !== false).map((p) => (
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
                <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
                  Com o email do Gmail, o plano aparece sozinho quando a pessoa entra com esse Google (sem código). Sem email, é por código.
                </p>
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
                          <td>
                            {a.nome}
                            {a.contacto ? <div className="muted" style={{ fontSize: 12.5 }}>{a.contacto}</div> : null}
                          </td>
                          <td>
                            {a.codigo}
                            {a.user_id ? (
                              <div className="muted" style={{ fontSize: 12.5 }}>ligado a conta Google</div>
                            ) : a.email ? (
                              <div className="muted" style={{ fontSize: 12.5 }}>reservado para {a.email}</div>
                            ) : null}
                          </td>
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
                              {!a.ativo && (
                                <button className="btn btn-ghost btn-perigo" onClick={() => apagar(a)} disabled={aGuardar}>
                                  Apagar
                                </button>
                              )}
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
          <p style={{ marginBottom: 12 }}>
            <button className="btn btn-ghost btn-perigo" type="button" onClick={() => limparUso({})}>
              Limpar histórico
            </button>
            <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
              Apaga os dias anteriores a hoje. O de hoje fica.
            </span>
          </p>
          {msgUso && <p className="muted" role="status">{msgUso}</p>}
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
                    <th></th>
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
                      <td>
                        {hoje && l.dia < hoje ? (
                          <button className="btn btn-ghost btn-perigo" type="button" onClick={() => limparUso({ codigo: l.codigo, dia: l.dia })}>
                            Apagar
                          </button>
                        ) : null}
                      </td>
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
