import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Fingerprint, LockKeyhole, Mail, ShieldCheck, Smartphone } from "lucide-react";
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

  const title = mode === "login" ? "Entre no Práxis" : "Recuperar senha";
  const description = mode === "login"
    ? "Acesse sua unidade com biometria, passkey ou credenciais individuais, mantendo segurança e continuidade em qualquer dispositivo."
    : "Informe seu e-mail para receber um link seguro de recuperação.";

  return <div className="auth-shell praxis-auth-shell">
    <div className="praxis-auth-shape praxis-auth-shape-a" aria-hidden="true" />
    <div className="praxis-auth-shape praxis-auth-shape-b" aria-hidden="true" />
    <div className="praxis-auth-shape praxis-auth-shape-c" aria-hidden="true" />
    <section className="auth-card praxis-auth-card">
      <img className="auth-logo auth-logo-light" src="/brand/logo-horizontal-light.webp" alt="Práxis — Controle de Processos" />
      <img className="auth-logo auth-logo-dark" src="/brand/logo-horizontal-dark.webp" alt="Práxis — Controle de Processos" />

      <div className="praxis-auth-copy">
        <p className="eyebrow">Acesso seguro</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      {mode === "login" && <div className="praxis-auth-features" aria-hidden="true">
        <span><ShieldCheck size={16} />Sessão protegida</span>
        <span><Fingerprint size={16} />Biometria / passkey</span>
        <span><Smartphone size={16} />Experiência PWA</span>
      </div>}

      {mode === "login" && selectedMethod === "detecting" && <div className="auth-method-loading praxis-auth-notice">Verificando os métodos de acesso disponíveis...</div>}

      {mode === "login" && biometricAvailable && selectedMethod === "biometric" && <>
        <button type="button" className="button biometric-login praxis-biometric-hero" disabled={busy} onClick={signInWithBiometrics}>
          <Fingerprint size={22} />
          <span>{busy ? "Aguardando biometria..." : `Entrar com ${biometricLabel}`}</span>
        </button>
        <small className="praxis-biometric-helper">Use Touch ID, Face ID, Windows Hello ou a biometria disponível no dispositivo.</small>
      </>}

      {(mode === "forgot" || selectedMethod === "password") && <form className="praxis-auth-form" onSubmit={submit}>
        <label>E-mail<div className="input-with-icon"><Mail size={18} /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="voce@exemplo.com" /></div></label>
        {mode !== "forgot" && <label>Senha<div className="input-with-icon"><LockKeyhole size={18} /><input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Digite sua senha" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar ou ocultar senha">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
        <Turnstile onToken={setCaptchaToken} />
        {message && <div className="auth-message">{message}</div>}
        <button className="button primary auth-submit" disabled={busy || (Boolean(turnstileSiteKey) && !captchaToken)}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Enviar link de recuperação"}</button>
      </form>}

      {mode === "login" && biometricAvailable && selectedMethod === "biometric" && <>
        <div className="auth-divider"><span>ou</span></div>
        <button type="button" className="auth-switch praxis-auth-switch" disabled={busy} onClick={() => { setSelectedMethod("password"); setMessage(""); }}>Entrar com e-mail e senha</button>
        {message && <div className="auth-message">{message}</div>}
      </>}

      {mode === "login" && selectedMethod === "password" && <button className="forgot-password" onClick={() => { setMode("forgot"); setMessage(""); }}>Esqueci minha senha</button>}
      {(mode !== "login" || selectedMethod === "password") && <button className="auth-switch praxis-auth-switch" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setMessage(""); }}>{mode === "login" ? "Recuperar acesso" : "Voltar para o acesso"}</button>}

      <small>Novas contas são cadastradas exclusivamente pelo administrador do gabinete.</small>
    </section>
  </div>;
}
