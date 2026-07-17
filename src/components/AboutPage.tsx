import { Mail } from "lucide-react";

export function AboutPage() {
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Informações do aplicativo</p><h1>Sobre</h1><p>Autoria, finalidade e canais de contribuição.</p></div></div>
    <section className="panel about-card">
      <img src="/praxis-logo.png" alt="Práxis - Controle de Processos" />
      <div className="about-version">Práxis Online · Versão 0.5.1</div>
      <div className="about-copy">
        <p><strong>© 2026 Marcos Antonio Santos Machado. Todos os direitos reservados.</strong></p>
        <p>Idealização e criação: Marcos Antonio Santos Machado.</p>
        <p>Desenvolvido com assistência do ChatGPT/OpenAI.</p>
      </div>
      <div className="about-purpose">
        <h2>Finalidade</h2>
        <p>Desenvolvido para uso interno e específico, não se destinando à utilização comercial, empresarial ou institucional; contudo, seu aperfeiçoamento é livre para aqueles que quiserem contribuir com ideias, inovações e correções de bugs através do e-mail abaixo.</p>
      </div>
      <a className="about-email" href="mailto:marcosmachado@mppa.mp.br"><Mail size={18} />marcosmachado@mppa.mp.br</a>
    </section>
  </div>;
}
