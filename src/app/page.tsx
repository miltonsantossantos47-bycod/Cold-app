import Link from "next/link";

const publico = [
  "Estudantes", "Profissionais", "Empreendedores",
  "Empresas", "Universidades", "Escolas",
  "Professores", "Investigadores", "Autodidatas",
];

const passos = [
  { n: "1", t: "Diagnóstico", d: "Conta o que já sabes, o teu objetivo e quanto tempo tens por semana." },
  { n: "2", t: "Percurso personalizado", d: "O Cold segue um plano em Módulos → Lições, ajustado ao teu nível." },
  { n: "3", t: "Acompanhamento contínuo", d: "O teu Perfil de Aprendiz fica gravado — cada sessão continua de onde ficaste." },
];

const metodo = [
  { t: "Origem", d: "Porque é que este conceito existe e que problema resolveu." },
  { t: "Intuição", d: "A ideia primeiro, com exemplos do quotidiano. Fórmulas só depois." },
  { t: "Teoria e resolução", d: "Cada passo explicado: o objetivo de cada passo é sempre claro." },
  { t: "Perguntas, não respostas", d: "O tutor faz-te pensar em vez de entregar a solução logo." },
  { t: "Exercícios", d: "3 fáceis, 2 intermédios e 1 difícil, corrigidos passo a passo." },
  { t: "Domínio real", d: "Só avanças quando consegues explicar e resolver sozinho." },
];

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cold-logo-emblem.png" alt="Cold" />
          <Link href="/app" className="btn">Começar agora</Link>
        </div>
      </header>

      <main>
        <section className="hero container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cold-logo-wordmark.png" alt="Cold" />
          <div className="tag">The Learning Operating System</div>
          <h1>O teu percurso de aprendizagem, construído à tua medida</h1>
          <p>
            Nada de cursos fixos nem respostas genéricas. O Cold constrói um plano de estudo
            único para ti, e ajusta-o à medida que avanças.
          </p>
          <Link href="/app" className="btn">Começar agora</Link>
          <p className="note">Acesso por convite durante o piloto.</p>
        </section>

        <section className="section">
          <div className="container">
            <h2>O que é</h2>
            <p>
              O Cold é um Sistema Operativo de Aprendizagem: em vez de te dar um currículo pronto,
              mapeia o teu objetivo, o teu nível e o tempo que tens disponível, e constrói um
              percurso só teu — que se adapta sempre que precisares avançar mais rápido ou
              reforçar uma base.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2>Para quem é</h2>
            <p>Serve qualquer pessoa com algo concreto para aprender.</p>
            <div className="chips">
              {publico.map((p) => <span key={p} className="chip">{p}</span>)}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2>Como funciona</h2>
            <div className="grid-3">
              {passos.map((p) => (
                <div key={p.n} className="card">
                  <div className="n">{p.n}</div>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2>O método</h2>
            <p>Compreender antes de memorizar. É assim que cada lição é conduzida.</p>
            <div className="grid-3">
              {metodo.map((m) => (
                <div key={m.t} className="card">
                  <h3>{m.t}</h3>
                  <p>{m.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section cta-final">
          <div className="container">
            <h2>Pronto para começar?</h2>
            <Link href="/app" className="btn">Começar agora</Link>
          </div>
        </section>
      </main>

      <footer className="footer">Cold — The Learning Operating System</footer>
    </>
  );
}
