import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, LogOut, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { requireSupabase } from "../supabase";

type MfaMode = "loading" | "setup" | "verify" | "error";

function readableError(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "error", "msg"]) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim() && value.trim() !== "{}") return value;
    }
  }
  return fallback;
}

export function MfaGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<MfaMode>("loading");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void prepare();
  }, []);

  async function createFreshEnrollment(): Promise<void> {
    const client = requireSupabase();
    const factors = await client.auth.mfa.listFactors();

    if (factors.error) {
      throw new Error(readableError(factors.error, "Não foi possível consultar a verificação em duas etapas."));
    }

    const totpFactors = factors.data?.totp ?? [];
    const verified = totpFactors.find((item) => item.status === "verified");

    if (verified) {
      setFactorId(verified.id);
      setQr("");
      setMode("verify");
      return;
    }

    for (const factor of totpFactors) {
      const removal = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (removal.error) {
        throw new Error(readableError(
          removal.error,
          "Existe uma configuração incompleta de verificação em duas etapas. Saia da conta e tente novamente.",
        ));
      }
    }

    const enrollment = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Práxis",
    });

    if (enrollment.error) {
      throw new Error(readableError(
        enrollment.error,
        "Não foi possível gerar o QR Code da verificação em duas etapas.",
      ));
    }

    setFactorId(enrollment.data.id);
    setQr(enrollment.data.totp.qr_code);
    setMode("setup");
  }

  async function prepare(): Promise<void> {
    setMode("loading");
    setMessage("");
    setCode("");

    try {
      const client = requireSupabase();
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();

      if (assurance.error) {
        throw new Error(readableError(
          assurance.error,
          "Não foi possível verificar o nível de segurança da sessão.",
        ));
      }

      if (assurance.data?.currentLevel === "aal2") {
        setReady(true);
        return;
      }

      await createFreshEnrollment();
    } catch (error) {
      setMessage(readableError(
        error,
        "Não foi possível preparar a verificação em duas etapas. Tente novamente.",
      ));
      setMode("error");
    }
  }

  async function verify(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!factorId || code.length !== 6) return;

    setBusy(true);
    setMessage("");

    try {
      const client = requireSupabase();
      const challenge = await client.auth.mfa.challenge({ factorId });

      if (challenge.error) {
        throw new Error(readableError(
          challenge.error,
          "Não foi possível iniciar a validação do código.",
        ));
      }

      const result = await client.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      });

      if (result.error) {
        throw new Error(readableError(
          result.error,
          "Código inválido ou expirado. Aguarde um novo código e tente novamente.",
        ));
      }

      setReady(true);
    } catch (error) {
      setMessage(readableError(
        error,
        "Não foi possível validar o código. Tente novamente.",
      ));
    } finally {
      setBusy(false);
    }
  }

  if (ready) return <>{children}</>;

  return (
    <div className="auth-shell p1-entry-shell">
      <div className="p1-entry-ambient p1-entry-ambient-a" aria-hidden="true" />
      <div className="p1-entry-ambient p1-entry-ambient-b" aria-hidden="true" />

      <section className="auth-card mfa-card p1-entry-card p1-mfa-card">
        <div className="p1-entry-brand">
          <img className="p1-entry-logo p1-entry-logo-light" src="/brand/praxis-1-logo-light.webp" alt="Práxis" />
          <img className="p1-entry-logo p1-entry-logo-dark" src="/brand/praxis-1-logo-dark.webp" alt="Práxis" />
        </div>

        <div className="p1-security-icon" aria-hidden="true">
          {mode === "loading"
            ? <LoaderCircle className="p1-spin" size={29} />
            : mode === "setup"
              ? <QrCode size={29} />
              : <ShieldCheck size={29} />}
        </div>

        <div className="p1-entry-heading">
          <span className="p1-entry-kicker"><ShieldCheck size={15} /> Proteção da conta</span>
          <h1>Verificação em duas etapas</h1>
        </div>

        {mode === "loading" && (
          <div className="p1-entry-method-loading">
            <span>Preparando a verificação de segurança da sua conta...</span>
          </div>
        )}

        {mode === "setup" && (
          <>
            <p className="p1-entry-description">
              Escaneie o QR Code com Senhas do iPhone, Google Authenticator ou outro
              aplicativo compatível. Depois, informe o código de seis dígitos.
            </p>
            <div className="p1-qr-frame">
              <img className="mfa-qr p1-mfa-qr" src={qr} alt="QR Code para configurar o autenticador" />
            </div>
          </>
        )}

        {mode === "verify" && (
          <p className="p1-entry-description">
            Informe o código atual do seu aplicativo autenticador para continuar.
          </p>
        )}

        {(mode === "setup" || mode === "verify") && (
          <form className="p1-entry-form" onSubmit={verify}>
            <label>
              Código do autenticador
              <div className="input-with-icon p1-entry-input p1-code-input">
                <KeyRound size={18} />
                <input
                  autoFocus
                  required
                  aria-label="Código de seis dígitos do autenticador"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
              </div>
            </label>

            {message && <div className="auth-message p1-entry-message">{message}</div>}

            <button className="button primary auth-submit p1-entry-primary" disabled={busy || code.length !== 6}>
              {busy
                ? "Verificando..."
                : mode === "setup"
                  ? "Cadastrar e entrar"
                  : "Verificar e entrar"}
            </button>
          </form>
        )}

        {mode === "error" && (
          <>
            <div className="auth-message p1-entry-message">
              {message || "Não foi possível preparar a verificação em duas etapas."}
            </div>
            <button className="button primary auth-submit p1-entry-primary" onClick={() => void prepare()}>
              <RefreshCw size={17} />
              Tentar novamente
            </button>
          </>
        )}

        <button
          className="auth-switch p1-entry-text-action"
          onClick={() => void requireSupabase().auth.signOut()}
          disabled={busy}
        >
          <LogOut size={16} /> Sair desta conta
        </button>
      </section>
    </div>
  );
}
