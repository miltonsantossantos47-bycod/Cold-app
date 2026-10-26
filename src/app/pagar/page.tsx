import Link from "next/link";
import { PLANOS, formatarKz } from "../../lib/planos";

export const dynamic = "force-dynamic"; // lê os dados de pagamento das variáveis da Vercel

export const metadata = { title: "Planos e como pagar — Cold" };

export default function PagarPage() {
  const numero = process.env.PAGAMENTO_EXPRESS_NUMERO?.trim();
  const titular = process.env.PAGAMENTO_TITULAR?.trim();
  const whatsapp = (process.env.WHATSAPP_NUMERO ?? "").replace(/\D/g, "");
  const msg = encodeURIComponent("Olá! Já paguei o meu plano do Cold. Segue o comprovativo. Plano: ___  Nome: ___");
  const planos = PLANOS.filter((p) => p.publico);

  return (
    <div className="pagar">
      <p>
        <Link href="/app">← Voltar ao Cold</Link>
      </p>
      <h1>Planos e como pagar</h1>
      <p className="muted">Escolhe o plano pelo número de trocas por dia. Cada troca é uma pergunta tua e a resposta do tutor.</p>

      <div className="planos">
        {planos.map((p) => (
          <div key={p.id} className="plano">
            <h2>{p.nome}</h2>
            <div className="preco">{p.precoKz === 0 ? "Grátis" : formatarKz(p.precoKz)}</div>
            <div className="muted">{p.precoKz === 0 ? `${p.dias} dias` : `por ${p.dias} dias`}</div>
            <p>{p.descricao}</p>
          </div>
        ))}
      </div>

      <h2>Como pagar</h2>
      <ol className="passos-pagar">
        <li>Escolhe o plano que queres.</li>
        <li>
          Paga por <strong>Multicaixa Express</strong>
          {numero ? (
            <>
              {" "}para <strong>{numero}</strong>
              {titular ? <> ({titular})</> : null}.
            </>
          ) : (
            <>. Pede-nos os dados de pagamento por WhatsApp.</>
          )}
        </li>
        <li>Envia o comprovativo por WhatsApp, com o teu nome e o plano.</li>
        <li>Assim que confirmarmos, recebes o teu código e podes começar. Se já tens código, ele é renovado.</li>
      </ol>

      {whatsapp ? (
        <p>
          <a className="btn" href={`https://wa.me/${whatsapp}?text=${msg}`} target="_blank" rel="noopener noreferrer">
            Enviar comprovativo por WhatsApp
          </a>
        </p>
      ) : null}

      <p className="muted">
        Renovar: paga outra vez antes do fim e os dias novos somam-se aos que te restam. O limite de trocas renova todos os dias à
        meia-noite (00:00, hora de Luanda).
      </p>
      <p className="muted">
        Já tens código? <Link href="/app">Entra aqui</Link>.
      </p>
    </div>
  );
}
