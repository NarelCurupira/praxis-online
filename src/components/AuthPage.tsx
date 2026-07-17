import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, TicketCheck } from "lucide-react";
import { acceptTeamInvite, validateTeamInvite } from "../api";
import { requireSupabase } from "../supabase";

declare global { interface Window { turnstile?: { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (id?: string) => void }; } }
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || "";

function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!turnstileSiteKey || !container.current) return;
    const render = () => { if (container.current && window.turnstile) window.turnstile.render(container.current, { sitekey: turnstileSiteKey, callback: onToken, "expired-callback": () => onToken("") }); };
    if (window.turnstile) { render(); return; }
    const script = document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; script.defer = true; script.onload = render; document.head.appendChild(script);
  }, [onToken]);
  return turnstileSiteKey ? <div className="turnstile-box" ref={container} /> : null;
}

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "invite">("login"); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [invite, setInvite] = useState(""); const [captchaToken, setCaptchaToken] = useState(""); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); const client = requireSupabase();
    try {
      if (mode === "invite") {
        if (!(await validateTeamInvite(email, invite))) throw new Error("Convite inválido, expirado ou pertencente a outro e-mail.");
        localStorage.setItem("praxis-pending-invite", invite.toUpperCase());
        const result = await client.auth.signUp({ email, password, options: { data: { full_name: name.trim() }, captchaToken: captchaToken || undefined } });
        if (result.error) throw result.error;
        if (result.data.session) await acceptTeamInvite(invite);
        else setMessage("Cadastro realizado. Confirme o e-mail e, depois, entre normalmente para concluir o convite.");
      } else {
        const result = await client.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken || undefined } });
        if (result.error) throw result.error;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <div className="auth-shell"><section className="auth-card"><img src="/praxis-logo.png" alt="Práxis — Controle de Processos" /><p className="eyebrow">Acesso seguro</p><h1>{mode === "login" ? "Entre no Práxis Online" : "Cadastro por convite"}</h1><p>{mode === "login" ? "Use sua conta individual para acessar o espaço compartilhado." : "Informe o mesmo e-mail para o qual o administrador gerou o convite."}</p><form onSubmit={submit}>{mode === "invite" && <><label>Nome completo<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label><label>Código do convite<div className="input-with-icon"><TicketCheck size={18} /><input required value={invite} onChange={(event) => setInvite(event.target.value.toUpperCase())} maxLength={12} /></div></label></>}<label>E-mail<div className="input-with-icon"><Mail size={18} /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></label><label>Senha<div className="input-with-icon"><LockKeyhole size={18} /><input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar ou ocultar senha">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><Turnstile onToken={setCaptchaToken} />{message && <div className="auth-message">{message}</div>}<button className="button primary auth-submit" disabled={busy || (Boolean(turnstileSiteKey) && !captchaToken)}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Cadastrar com convite"}</button></form><button className="auth-switch" onClick={() => { setMode(mode === "login" ? "invite" : "login"); setMessage(""); }}>{mode === "login" ? "Tenho um convite" : "Já tenho uma conta"}</button><small>O cadastro público está desativado. Novas contas só entram no gabinete por convite administrativo.</small></section></div>;
}
