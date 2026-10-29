"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CONTAS_ATIVAS, contaDaSessao, entrarComGoogle, sessaoAtual, tokenAtual, type Conta } from "../../lib/auth-cliente";
import { DESCONTO_PLANOS, PERSONALIZADO, PLANOS, PRECO_TROCA_KZ, formatarKz, precoBase } from "../../lib/planos";

type PedidoVisto = {
  ref: string;
  tipo: string;
  trocas_dia: number;
  dias: number;
  preco_kz: number;
  quando: "agora" | "depois";
  estado: "pendente" | "confirmado" | "cancelado";
};

type Props = { numero: string; titular: string; whatsapp: string };

const ESTADOS: Record<string, string> = { pendente: "por pagar", confirmado: "ativo", cancelado: "cancelado" };

function rotulo(p: { tipo: string; trocas_dia: number; dias: number }): string {
  const nome = PLANOS.find((x) => x.id === p.tipo && x.id !== "personalizado")?.nome;
  return nome ? `${nome} (${p.trocas_dia} por dia, ${p.dias} dias)` : `Personalizado (${p.trocas_dia} por dia, ${p.dias} dias)`;
}

export default function PedirPlano({ numero, titular, whatsapp }: Props) {
  const [conta, setConta] = useState<Conta | null>(null);
  const [aVer, setAVer] = useState(CONTAS_ATIVAS);
  const [meus, setMeus] = useState<PedidoVisto[]>([]);
  const [temPlano, setTemPlano] = useState(false);
  const [quando, setQuando] = useState<"agora" | "depois">("depois");
  const [trocas, setTrocas] = useState(5);
  const [dias, setDias] = useState(30);
  const [criado, setCriado] = useState<PedidoVisto | null>(null);
  const [erro, setErro] = useState("");
  const [aEnviar, setAEnviar] = useState(false);

  async function carregarPedidos() {
    const t = await tokenAtual();
    if (!t) return;
    const r = await fetch("/api/pedidos", { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) return;
    const d = (await r.json()) as { pedidos: PedidoVisto[]; temPlano: boolean };
    setMeus(d.pedidos);
    setTemPlano(d.temPlano);
  }

  useEffect(() => {
    if (!CONTAS_ATIVAS) return;
    (async () => {
      try {
        const c = contaDaSessao(await sessaoAtual());
        setConta(c);
        if (c) await carregarPedidos();
      } catch {
        /* sem sessão */
      } finally {
        setAVer(false);
      }
    })();
  }, []);

  async function entrar() {
    setErro("");
    try {
      localStorage.setItem("cold:destino", JSON.stringify("/pagar")); // depois do login volta a esta página
      await entrarComGoogle();
    } catch {
      setErro("Não consegui abrir o Google. Abre este link no Chrome ou no Safari e tenta de novo.");
    }
  }

  async function pedir(corpo: Record<string, unknown>) {
    if (!conta) return entrar();
    setErro("");
    setCriado(null);
    setAEnviar(true);
    try {
      const t = await tokenAtual();
      const r = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ...corpo, quando }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro.");
      setCriado({ ref: d.ref, tipo: String(corpo.tipo), trocas_dia: d.trocas_dia, dias: d.dias, preco_kz: d.preco_kz, quando: d.quando, estado: "pendente" });
      await carregarPedidos();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de ligação.");
    } finally {
      setAEnviar(false);
    }
  }

  async function cancelar(ref: string) {
    setErro("");
    try {
      const t = await tokenAtual();
      const r = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ acao: "cancelar", ref }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erro.");
      if (criado?.ref === ref) setCriado(null);
      await carregarPedidos();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de ligação.");
    }
  }

  const tOk = Number.isInteger(trocas) && trocas >= PERSONALIZADO.trocasMin && trocas <= PERSONALIZADO.trocasMax;
  const dOk = Number.isInteger(dias) && dias >= PERSONALIZADO.diasMin && dias <= PERSONALIZADO.diasMax;
  const precoPers = tOk && dOk ? precoBase(trocas, dias) : 0;
  const fixos = PLANOS.filter((p) => p.publico && p.precoKz > 0);
  const teste = PLANOS.find((p) => p.id === "teste");
  const textoBotao = (txt: string) => (aEnviar ? "A criar o pedido…" : conta || !CONTAS_ATIVAS ? txt : "Entrar com Google para pedir");

  function linkWhatsApp(p: PedidoVisto) {
    const msg = encodeURIComponent(
      `Olá! Paguei o meu pedido ${p.ref} (${rotulo(p)}, ${formatarKz(p.preco_kz)}). Segue o comprovativo. Email: ${conta?.email ?? "___"}`
    );
    return `https://wa.me/${whatsapp}?text=${msg}`;
  }

  return (
    <>
      <p className="muted">
        Cada troca (uma pergunta tua e a resposta do tutor) custa {formatarKz(PRECO_TROCA_KZ)}. Os planos fixos têm{" "}
        <strong>{Math.round(DESCONTO_PLANOS * 100)}% de desconto</strong> em relação a montares um plano igual no personalizado.
      </p>

      {CONTAS_ATIVAS && !aVer && !conta && (
        <div className="aviso" role="status" style={{ margin: "14px 0" }}>
          Para pedires um plano, entra primeiro com o Google. Assim sabemos a que conta ativar o plano.{" "}
          <button className="btn btn-ghost" type="button" onClick={entrar}>
            Entrar com Google
          </button>
        </div>
      )}
      {conta && <p className="muted">Entraste como {conta.email}.</p>}

      {conta && temPlano && (
        <fieldset className="quando">
          <legend>Já tens um plano ativo. Quando queres que este comece?</legend>
          <label>
            <input type="radio" name="quando" checked={quando === "depois"} onChange={() => setQuando("depois")} /> Depois do plano atual
            (os dias somam-se)
          </label>
          <label>
            <input type="radio" name="quando" checked={quando === "agora"} onChange={() => setQuando("agora")} /> Agora (vale o melhor limite dos
            dois; o outro continua a contar os dias)
          </label>
        </fieldset>
      )}

      <div className="planos">
        {teste && (
          <div className="plano">
            <h2>{teste.nome}</h2>
            <div className="preco">Grátis</div>
            <div className="muted">{teste.dias} dias</div>
            <p>{teste.descricao}</p>
            <Link className="btn btn-ghost" href="/teste">
              Experimentar
            </Link>
          </div>
        )}
        {fixos.map((p) => (
          <div key={p.id} className="plano">
            <h2>{p.nome}</h2>
            <div className="antes">
              <s>{formatarKz(p.precoOriginalKz ?? 0)}</s> <span className="selo">−{Math.round(DESCONTO_PLANOS * 100)}%</span>
            </div>
            <div className="preco">{formatarKz(p.precoKz)}</div>
            <div className="muted">por {p.dias} dias</div>
            <p>{p.trocasPorDia} trocas por dia.</p>
            <button className="btn" type="button" disabled={aEnviar} onClick={() => pedir({ tipo: p.id })}>
              {textoBotao("Pedir este plano")}
            </button>
          </div>
        ))}
      </div>

      <div className="plano personalizado">
        <h2>Plano personalizado</h2>
        <p className="muted">Escolhe tu quantas trocas por dia e durante quantos dias.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="trocas">Trocas por dia ({PERSONALIZADO.trocasMin} a {PERSONALIZADO.trocasMax})</label>
            <input id="trocas" type="number" inputMode="numeric" min={PERSONALIZADO.trocasMin} max={PERSONALIZADO.trocasMax} value={Number.isNaN(trocas) ? "" : trocas} onChange={(e) => setTrocas(e.target.value === "" ? NaN : Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="dias">Dias ({PERSONALIZADO.diasMin} a {PERSONALIZADO.diasMax})</label>
            <input id="dias" type="number" inputMode="numeric" min={PERSONALIZADO.diasMin} max={PERSONALIZADO.diasMax} value={Number.isNaN(dias) ? "" : dias} onChange={(e) => setDias(e.target.value === "" ? NaN : Number(e.target.value))} />
          </div>
        </div>
        <div className="preco" aria-live="polite">
          {tOk && dOk ? formatarKz(precoPers) : "—"}
        </div>
        <p className="muted">
          {tOk && dOk
            ? `${trocas} trocas por dia × ${dias} dias × ${formatarKz(PRECO_TROCA_KZ)}`
            : `Escolhe entre ${PERSONALIZADO.trocasMin} e ${PERSONALIZADO.trocasMax} trocas por dia, e entre ${PERSONALIZADO.diasMin} e ${PERSONALIZADO.diasMax} dias.`}
        </p>
        <button className="btn" type="button" disabled={aEnviar || !tOk || !dOk} onClick={() => pedir({ tipo: "personalizado", trocas_dia: trocas, dias })}>
          {textoBotao("Pedir plano personalizado")}
        </button>
      </div>

      {erro && <div className="error" style={{ marginTop: 16 }}>{erro}</div>}

      {criado && (
        <div className="plano pedido-criado" role="status">
          <h2>Pedido {criado.ref} criado</h2>
          <p>
            {rotulo(criado)} · <strong>{formatarKz(criado.preco_kz)}</strong>
            {criado.quando === "depois" && temPlano ? " · começa quando o teu plano atual terminar" : ""}
          </p>
          <ol className="passos-pagar">
            <li>
              Paga <strong>{formatarKz(criado.preco_kz)}</strong> por <strong>Multicaixa Express</strong>
              {numero ? (
                <>
                  {" "}para <strong>{numero}</strong>
                  {titular ? <> ({titular})</> : null}.
                </>
              ) : (
                <>. Pede-nos os dados de pagamento por WhatsApp.</>
              )}
            </li>
            <li>
              Envia o comprovativo por WhatsApp com a referência <strong>{criado.ref}</strong>.
            </li>
            <li>Quando confirmarmos o pagamento, o plano fica ativo na tua conta. Volta ao Cold e toca em «Verificar o meu plano».</li>
          </ol>
          {whatsapp ? (
            <p>
              <a className="btn" href={linkWhatsApp(criado)} target="_blank" rel="noopener noreferrer">
                Enviar comprovativo por WhatsApp
              </a>
            </p>
          ) : null}
        </div>
      )}

      {conta && meus.length > 0 && (
        <>
          <h2>Os meus pedidos</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Referência</th>
                  <th>Plano</th>
                  <th>Preço</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {meus.map((p) => (
                  <tr key={p.ref}>
                    <td>{p.ref}</td>
                    <td>{rotulo(p)}</td>
                    <td>{formatarKz(p.preco_kz)}</td>
                    <td>
                      <span className={`estado ${p.estado === "confirmado" ? "ativo" : p.estado === "cancelado" ? "desativado" : ""}`}>{ESTADOS[p.estado]}</span>
                    </td>
                    <td>
                      {p.estado === "pendente" && (
                        <button className="btn btn-ghost" type="button" onClick={() => cancelar(p.ref)}>
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!CONTAS_ATIVAS && (
        <>
          <h2>Como pagar</h2>
          <ol className="passos-pagar">
            <li>Escolhe o plano que queres.</li>
            <li>
              Paga por <strong>Multicaixa Express</strong>
              {numero ? <> para <strong>{numero}</strong>{titular ? <> ({titular})</> : null}.</> : <>. Pede-nos os dados de pagamento por WhatsApp.</>}
            </li>
            <li>Envia o comprovativo por WhatsApp, com o teu nome e o plano (e as trocas por dia e os dias, se for personalizado).</li>
          </ol>
          {whatsapp ? (
            <p>
              <a className="btn" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                Falar por WhatsApp
              </a>
            </p>
          ) : null}
        </>
      )}

      <h2>Como funcionam as renovações</h2>
      <ul className="passos-pagar">
        <li>Cada pedido é pago uma vez, para o período escolhido. Não há cobrança automática.</li>
        <li>Se pedires outro plano com um ativo, escolhes se começa <strong>depois</strong> (os dias somam-se, sem perderes nada) ou <strong>agora</strong>.</li>
        <li>O limite de trocas renova todos os dias à meia-noite (00:00, hora de Luanda).</li>
      </ul>
    </>
  );
}
