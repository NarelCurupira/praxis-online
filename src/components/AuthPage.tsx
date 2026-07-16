import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { requireSupabase } from "../supabase";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const client = requireSupabase();
    const result = mode === "login"
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "register") setMessage("Cadastro realizado. Confira seu e-mail se a confirmação estiver ativada.");
  }

  return <div className="auth-shell">
    <section className="auth-card">
      <img src="/praxis-logo.png" alt="Práxis — Controle de Processos" />
      <p className="eyebrow">Acesso seguro</p>
      <h1>{mode === "login" ? "Entre no Práxis Online" : "Crie sua conta"}</h1>
      <p>{mode === "login" ? "Seus processos ficam disponíveis nos computadores autorizados." : "A primeira conta cria um espaço de trabalho administrativo."}</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>Nome completo<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>}
        <label>E-mail<div className="input-with-icon"><Mail size={18} /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></label>
        <label>Senha<div className="input-with-icon"><LockKeyhole size={18} /><input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar ou ocultar senha">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        {message && <div className="auth-message">{message}</div>}
        <button className="button primary auth-submit" disabled={busy}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Cadastrar"}</button>
      </form>
      <button className="auth-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}>{mode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho uma conta"}</button>
      <small>Versão de testes. Use somente dados fictícios ou anonimizados.</small>
    </section>
  </div>;
}

