import { Database, Globe2, Mail, ShieldCheck } from "lucide-react";
import { PRAXIS_BUILD, shortCommit } from "../buildInfo";
import { PRAXIS_VERSION } from "../version";

export function AboutPage() {
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Informações do aplicativo</p><h1>Sobre</h1><p>Autoria, finalidade e ambiente.</p></div></div>
    <section className="panel about-card">
      <img src="/praxis-logo.png" alt="Práxis - Controle de Processos" />
      <div className="about-version">Práxis Web · Versão {PRAXIS_VERSION}</div><div className="build-metadata"><span><strong>Compilação</strong>{shortCommit()}</span><span><strong>Publicação</strong>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(PRAXIS_BUILD.publishedAt))}</span></div>
      <div className="about-copy"><p><strong>© 2026 Marcos Antonio Santos Machado. Todos os direitos reservados.</strong></p><p>Idealização e criação: Marcos Antonio Santos Machado.</p><p>Desenvolvido com assistência do ChatGPT/OpenAI.</p></div>
      <div className="about-purpose about-disclaimer">
        <h2>Natureza e finalidade de uso</h2>
        <p>O Práxis Web é uma ferramenta privada de apoio à organização e ao controle pessoal de processos, criada sem finalidade comercial, lucrativa ou institucional. Seu uso é restrito ao criador e às pessoas por ele expressamente autorizadas.</p>
        <p>O software não integra, não representa e não substitui sistemas oficiais do Ministério Público, do Poder Judiciário ou de qualquer outra instituição. Não se destina à distribuição pública, cessão, revenda, comercialização ou exploração econômica.</p>
        <p>Os dados, prazos, indicadores e relatórios possuem caráter exclusivamente auxiliar e devem ser conferidos nos sistemas oficiais. O acesso, a reprodução, a disponibilização ou o uso por terceiros dependem de autorização expressa do criador.</p>
      </div>
      <div className="about-purpose"><h2>Informações do ambiente</h2><div className="environment-grid"><span><Globe2 />Aplicação on-line</span><span><Database />PostgreSQL no Supabase</span><span><ShieldCheck />Autenticação e RLS</span><span>Fuso: America/Belem</span></div></div>
      <a className="about-email" href="mailto:marcosmachado@mppa.mp.br"><Mail size={18} />marcosmachado@mppa.mp.br</a>
    </section>
  </div>;
}
