import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Fingerprint, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { detectPasskeyCapability, friendlyPasskeyError, isPasskeyEnabledForThisBrowser } from "../passkeySupport";
import { requireSupabase } from "../supabase";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || "";

function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!turnstileSiteKey || !container.current) return;

    const render = () => {
      if (container.current && window.turnstile) {
        window.turnstile.render(container.current, {
          sitekey: turnstileSiteKey,
          callback: onToken,
          "expired-callback": () => onToken(""),
        });
      }
    };

    if (window.turnstile) {
      render();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [onToken]);

  return turnstileSiteKey ? <div className="turnstile-box p1-turnstile" ref={container} /> : null;
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
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      sessionStorage.removeItem("praxis-authenticated-with-passkey");
    } catch {
      /* Sessão sem armazenamento disponível. */
    }

    const client = requireSupabase();

    try {
      if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
          captchaToken: captchaToken || undefined,
        });
        if (error) throw error;
        setMessage("Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Verifique também a caixa de spam.");
      } else {
        const result = await client.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: captchaToken || undefined },
        });
        if (result.error) throw result.error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithBiometrics() {
    setSelectedMethod("biometric");
    setBusy(true);
    setMessage("");

    try {
      const client = requireSupabase();
      const auth = client.auth as typeof client.auth & {
        signInWithPasskey?: () => Promise<{ error?: Error | null }>;
      };
      if (!auth.signInWithPasskey) {
        throw new Error("Atualize a biblioteca do Supabase para habilitar passkeys.");
      }

      const result = await auth.signInWithPasskey();
      if (result.error) throw result.error;

      try {
        sessionStorage.setItem("praxis-authenticated-with-passkey", "true");
      } catch {
        /* Marcador auxiliar indisponível. */
      }
    } catch (error) {
      setMessage(friendlyPasskeyError(error));
    } finally {
      setBusy(false);
    }
  }

  const passwordMode = mode === "login" && selectedMethod === "password";
  const biometricMode = mode === "login" && biometricAvailable && selectedMethod === "biometric";

  return (
    <div className="auth-shell p1-entry-shell">
      <div className="p1-entry-ambient p1-entry-ambient-a" aria-hidden="true" />
      <div className="p1-entry-ambient p1-entry-ambient-b" aria-hidden="true" />

      <section className="auth-card p1-entry-card">
        <div className="p1-entry-brand">
          <img className="p1-entry-logo p1-entry-logo-light" src="/brand/praxis-1-logo-light.webp" alt="Práxis" />
          <img className="p1-entry-logo p1-entry-logo-dark" src="/brand/praxis-1-logo-dark.webp" alt="Práxis" />
        </div>

        {mode === "forgot" ? (
          <>
            <div className="p1-entry-heading">
              <span className="p1-entry-kicker"><ShieldCheck size={15} /> Recuperação segura</span>
              <h1>Recupere seu acesso</h1>
              <p>Informe o e-mail da sua conta. Enviaremos um link seguro para cadastrar uma nova senha.</p>
            </div>

            <form className="p1-entry-form" onSubmit={submit}>
              <label>
                E-mail
                <div className="input-with-icon p1-entry-input">
                  <Mail size={18} />
                  <input
                    required
                    autoFocus
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="voce@exemplo.com"
                  />
                </div>
              </label>

              <Turnstile onToken={setCaptchaToken} />

              {message && <div className="auth-message p1-entry-message" aria-live="polite">{message}</div>}

              <button
                className="button primary auth-submit p1-entry-primary"
                disabled={busy || (Boolean(turnstileSiteKey) && !captchaToken)}
              >
                {busy ? "Enviando..." : "Enviar link de recuperação"}
              </button>
            </form>

            <button
              type="button"
              className="auth-switch p1-entry-text-action"
              onClick={() => {
                setMode("login");
                setMessage("");
                setCaptchaToken("");
                setSelectedMethod(biometricAvailable ? "biometric" : "password");
              }}
            >
              <ArrowLeft size={16} /> Voltar para o acesso
            </button>
          </>
        ) : (
          <>
            <div className="p1-entry-heading">
              <span className="p1-entry-kicker"><Sparkles size={15} /> Acesso Práxis</span>
              <h1>Acesse sua conta</h1>
              <p>Use sua biometria para entrar com rapidez ou continue com suas credenciais.</p>
            </div>

            {selectedMethod === "detecting" && (
              <div className="p1-entry-method-loading">
                <span className="splash-spinner" aria-hidden="true" />
                <span>Verificando os métodos de acesso disponíveis...</span>
              </div>
            )}

            {biometricMode && (
              <div className="p1-biometric-stage">
                <div className="p1-biometric-symbol" aria-hidden="true">
                  <Fingerprint />
                </div>
                <div>
                  <strong>Biometria pronta</strong>
                  <span>{biometricLabel || "Passkey deste dispositivo"}</span>
                </div>

                <button
                  type="button"
                  className="button primary biometric-login p1-entry-primary"
                  disabled={busy}
                  onClick={signInWithBiometrics}
                >
                  <Fingerprint size={19} />
                  <span>{busy ? "Aguardando biometria..." : "Usar biometria"}</span>
                </button>

                <button
                  type="button"
                  className="auth-switch p1-entry-text-action"
                  disabled={busy}
                  onClick={() => {
                    setSelectedMethod("password");
                    setMessage("");
                  }}
                >
                  Entrar com sua senha
                </button>
              </div>
            )}

            {passwordMode && (
              <form className="p1-entry-form" onSubmit={submit}>
                <label>
                  E-mail
                  <div className="input-with-icon p1-entry-input">
                    <Mail size={18} />
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      placeholder="voce@exemplo.com"
                    />
                  </div>
                </label>

                <label>
                  Senha
                  <div className="input-with-icon p1-entry-input">
                    <LockKeyhole size={18} />
                    <input
                      required
                      minLength={8}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Mostrar ou ocultar senha"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <Turnstile onToken={setCaptchaToken} />

                {message && <div className="auth-message p1-entry-message" aria-live="polite">{message}</div>}

                <button
                  className="button primary auth-submit p1-entry-primary"
                  disabled={busy || (Boolean(turnstileSiteKey) && !captchaToken)}
                >
                  {busy ? "Aguarde..." : "Entrar no Práxis"}
                </button>

                <button
                  type="button"
                  className="forgot-password p1-entry-text-action"
                  onClick={() => {
                    setMode("forgot");
                    setMessage("");
                    setCaptchaToken("");
                  }}
                >
                  Esqueci minha senha
                </button>

                {biometricAvailable && (
                  <button
                    type="button"
                    className="auth-switch p1-entry-text-action"
                    disabled={busy}
                    onClick={() => {
                      setSelectedMethod("biometric");
                      setMessage("");
                    }}
                  >
                    <Fingerprint size={16} /> Voltar para biometria
                  </button>
                )}
              </form>
            )}

            {biometricMode && message && (
              <div className="auth-message p1-entry-message" aria-live="polite">{message}</div>
            )}
          </>
        )}

        <footer className="p1-entry-footer">
          <ShieldCheck size={14} />
          <span>Conta individual · sessão protegida · acesso auditável</span>
        </footer>
      </section>
    </div>
  );
}
