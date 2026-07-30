import { Cloud, Database, KeyRound } from "lucide-react";

export function SetupPage() {
  return <div className="auth-shell">
    <section className="auth-card setup-card">
      <img className="auth-logo auth-logo-light" src="/brand/logo-horizontal-light.webp" alt="Práxis — Controle de Processos" />
      <img className="auth-logo auth-logo-dark" src="/brand/logo-horizontal-dark.webp" alt="Práxis — Controle de Processos" />
      <p className="eyebrow">Práxis Online</p>
      <h1>Conecte o projeto ao Supabase</h1>
      <p>A interface online está pronta para receber as credenciais do projeto gratuito. Nenhum dado é armazenado enquanto a conexão não estiver configurada.</p>
      <div className="setup-steps">
        <div><Cloud /><span><b>1. Crie o projeto</b>Supabase Free, região e senha do banco.</span></div>
        <div><Database /><span><b>2. Execute o esquema</b>Use o arquivo <code>supabase/schema.sql</code>.</span></div>
        <div><KeyRound /><span><b>3. Informe as chaves públicas</b>Copie <code>.env.example</code> para <code>.env.local</code>.</span></div>
      </div>
      <small>Não coloque a senha do banco nem a chave <em>service_role</em> no arquivo da aplicação.</small>
    </section>
  </div>;
}
