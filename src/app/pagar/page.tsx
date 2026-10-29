import Link from "next/link";
import PedirPlano from "./pedir";

export const dynamic = "force-dynamic"; // lê os dados de pagamento das variáveis da Vercel

export const metadata = { title: "Planos e como pagar — Cold" };

export default function PagarPage() {
  const numero = process.env.PAGAMENTO_EXPRESS_NUMERO?.trim() ?? "";
  const titular = process.env.PAGAMENTO_TITULAR?.trim() ?? "";
  const whatsapp = (process.env.WHATSAPP_NUMERO ?? "").replace(/\D/g, "");

  return (
    <div className="pagar">
      <p>
        <Link href="/app">← Voltar ao Cold</Link>
      </p>
      <h1>Planos e como pagar</h1>
      <PedirPlano numero={numero} titular={titular} whatsapp={whatsapp} />
      <p className="muted" style={{ marginTop: 24 }}>
        Já tens código? <Link href="/app">Entra aqui</Link>. · <Link href="/privacidade">Privacidade</Link>
      </p>
    </div>
  );
}
