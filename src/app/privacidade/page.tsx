import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacidade — Cold" };

// Texto-modelo simples. Revê-o com um advogado antes de lançares a muita gente.
export default function PrivacidadePage() {
  const whatsapp = (process.env.WHATSAPP_NUMERO ?? "").replace(/\D/g, "");
  return (
    <div className="pagar">
      <p>
        <Link href="/">← Cold</Link>
      </p>
      <h1>Privacidade</h1>
      <p className="muted">O Cold é um tutor de estudo com inteligência artificial. Aqui explicamos, em linguagem simples, o que guardamos.</p>

      <h2>O que guardamos</h2>
      <ul className="passos-pagar">
        <li>
          <strong>A tua conta:</strong> o nome e o email da tua conta Google, quando entras com o Google. Não recebemos a tua palavra-passe.
        </li>
        <li>
          <strong>As tuas conversas</strong> com o tutor, para as veres em qualquer aparelho. Podes apagar cada conversa quando quiseres.
        </li>
        <li>
          <strong>O teu plano e os pagamentos:</strong> que plano tens, até quando, e o valor pago.
        </li>
        <li>
          <strong>O uso:</strong> quantas trocas fazes por dia, para aplicar os limites do teu plano.
        </li>
      </ul>

      <h2>Para que usamos</h2>
      <ul className="passos-pagar">
        <li>Para o tutor responder, as tuas mensagens são enviadas a um serviço de inteligência artificial (a Anthropic, que fornece o modelo Claude).</li>
        <li>Para te contactarmos sobre o teu plano e pedirmos a tua opinião.</li>
        <li>Não vendemos os teus dados nem os usamos para publicidade.</li>
      </ul>

      <h2>Quem os pode ver</h2>
      <p>
        Quem gere o Cold tem acesso técnico à base de dados e compromete-se a usá-la só para manter e melhorar o serviço. Os teus dados
        ficam guardados na plataforma Supabase.
      </p>

      <h2>Os teus direitos</h2>
      <p>
        Podes pedir para ver, corrigir ou apagar os teus dados e a tua conta.{" "}
        {whatsapp ? (
          <>
            Fala connosco por{" "}
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            .
          </>
        ) : (
          "Fala connosco por WhatsApp."
        )}
      </p>
      <p className="muted">Não coloques no chat dados sensíveis (palavras-passe, números de cartão ou de documentos).</p>
    </div>
  );
}
