import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Fingerprint, LockKeyhole, Mail } from "lucide-react";
import { detectPasskeyCapability, friendlyPasskeyError, isPasskeyEnabledForThisBrowser } from "../passkeySupport";
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
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [biometricLabel, setBiometricLabel] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<"detecting" | "biometric" | "password">("detecting");

  useEffect(() => {
    detectPasskeyCapability().then((capability) => {
      setBiometricLabel(capability.deviceLabel);
      const available = capability.supported && isPasskeyEnabledForThisBrowser();
      setBiometricAvailable(available);
      setSelectedMethod(available ? "biometric" : "password");
    }).catch(() => {
      setBiometricAvailable(false);
      setSelectedMethod("password");
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { sessionStorage.removeItem("praxis-authenticated-with-passkey"); } catch { /* Sessão sem armazenamento disponível. */ }
    const client = requireSupabase();
    try {
      if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin, captchaToken: captchaToken || undefined });
        if (error) throw error;
        setMessage("Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Verifique também a caixa de spam.");
      } else {
        const result = await client.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken || undefined } });
        if (result.error) throw result.error;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function signInWithBiometrics() {
    setSelectedMethod("biometric");
    setBusy(true); setMessage("");
    try {
      const client = requireSupabase();
      const auth = client.auth as typeof client.auth & { signInWithPasskey?: () => Promise<{ error?: Error | null }> };
      if (!auth.signInWithPasskey) throw new Error("Atualize a biblioteca do Supabase para habilitar passkeys.");
      const result = await auth.signInWithPasskey();
      if (result.error) throw result.error;
      try { sessionStorage.setItem("praxis-authenticated-with-passkey", "true"); } catch { /* Marcador auxiliar indisponível. */ }
    } catch (error) { setMessage(friendlyPasskeyError(error)); }
    finally { setBusy(false); }
  }

  const title = mode === "login" ? "Entre no Práxis Online" : "Recuperar senha";
  const description = mode === "login" ? "Use sua conta individual para acessar o espaço compartilhado." : "Informe seu e-mail para receber um link seguro de recuperação.";
  return <div className="auth-shell"><section className="auth-card"><img src="/praxis-logo.png" alt="Práxis — Controle de Processos" /><p className="eyebrow">Acesso seguro</p><h1>{title}</h1><p>{description}</p>
    {mode === "login" && selectedMethod === "detecting" && <div className="auth-method-loading">Verificando os métodos de acesso disponíveis...</div>}
    {mode === "login" && biometricAvailable && selectedMethod === "biometric" && <button type="button" className="button biometric-login" disabled={busy} onClick={signInWithBiometrics}><Fingerprint size={21} />{busy ? "Aguardando biometria..." : `Entrar com ${biometricLabel}`}</button>}
    {(mode === "forgot" || selectedMethod === "password") && <form onSubmit={submit}><label>E-mail<div className="input-with-icon"><Mail size={18} /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></label>{mode !== "forgot" && <label>Senha<div className="input-with-icon"><LockKeyhole size={18} /><input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar ou ocultar senha">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}<Turnstile onToken={setCaptchaToken} />{message && <div className="auth-message">{message}</div>}<button className="button primary auth-submit" disabled={busy || (Boolean(turnstileSiteKey) && !captchaToken)}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Enviar link de recuperação"}</button></form>}
    {mode === "login" && biometricAvailable && selectedMethod === "biometric" && <><button type="button" className="auth-switch" disabled={busy} onClick={() => { setSelectedMethod("password"); setMessage(""); }}>Entrar com e-mail e senha</button>{message && <div className="auth-message">{message}</div>}</>}{mode === "login" && selectedMethod === "password" && <button className="forgot-password" onClick={() => { setMode("forgot"); setMessage(""); }}>Esqueci minha senha</button>}{(mode !== "login" || selectedMethod === "password") && <button className="auth-switch" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setMessage(""); }}>{mode === "login" ? "Recuperar acesso" : "Voltar para o acesso"}</button>}<small>Novas contas são cadastradas exclusivamente pelo administrador do gabinete.</small></section></div>;
}
