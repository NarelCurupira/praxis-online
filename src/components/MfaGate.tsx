import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
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

    // O QR Code só é retornado no momento da inscrição. Fatores incompletos
    // precisam ser removidos para que um novo QR Code possa ser gerado.
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
    <div className="auth-shell">
      <section className="auth-card mfa-card">
        <div className="mfa-icon">
          {mode === "loading"
            ? <LoaderCircle className="splash-spinner" size={34} />
            : mode === "setup"
              ? <QrCode size={34} />
              : <ShieldCheck size={34} />}
        </div>

        <p className="eyebrow">Proteção da conta</p>
        <h1>Verificação em duas etapas</h1>

        {mode === "loading" && (
          <p>Preparando a verificação de segurança da sua conta...</p>
        )}

        {mode === "setup" && (
          <>
            <p>
              Escaneie o QR Code com o recurso Senhas do iPhone, Google Authenticator
              ou outro aplicativo compatível. Depois, informe o código de seis dígitos.
            </p>
            <img className="mfa-qr" src={qr} alt="QR Code para configurar o autenticador" />
          </>
        )}

        {mode === "verify" && (
          <p>Informe o código atual do seu aplicativo autenticador para continuar.</p>
        )}

        {(mode === "setup" || mode === "verify") && (
          <form onSubmit={verify}>
            <label>
              Código do autenticador
              <div className="input-with-icon">
                <KeyRound size={18} />
                <input
                  autoFocus
                  required
                  aria-label="Código de seis dígitos do autenticador"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
              </div>
            </label>

            {message && <div className="auth-message">{message}</div>}

            <button className="button primary auth-submit" disabled={busy || code.length !== 6}>
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
            <div className="auth-message">
              {message || "Não foi possível preparar a verificação em duas etapas."}
            </div>
            <button className="button primary auth-submit" onClick={() => void prepare()}>
              <RefreshCw size={17} />
              Tentar novamente
            </button>
          </>
        )}

        <button
          className="auth-switch"
          onClick={() => void requireSupabase().auth.signOut()}
          disabled={busy}
        >
          Sair desta conta
        </button>
      </section>
    </div>
  );
}
