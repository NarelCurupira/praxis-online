import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { requireSupabase } from "../supabase";

export function ResetPasswordPage({ onDone }: { onDone: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password !== confirmation) {
      setMessage("As senhas informadas não são iguais.");
      return;
    }

    setBusy(true);

    try {
      const client = requireSupabase();
      const { error } = await client.auth.updateUser({
        password,
        data: { must_set_password: false },
      });
      if (error) throw error;

      await client.auth.signOut({ scope: "others" });
      setSuccess(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell p1-entry-shell">
      <div className="p1-entry-ambient p1-entry-ambient-a" aria-hidden="true" />
      <div className="p1-entry-ambient p1-entry-ambient-b" aria-hidden="true" />

      <section className="auth-card reset-card p1-entry-card">
        <div className="p1-entry-brand">
          <img className="p1-entry-logo p1-entry-logo-light" src="/brand/praxis-1-logo-light.webp" alt="Práxis" />
          <img className="p1-entry-logo p1-entry-logo-dark" src="/brand/praxis-1-logo-dark.webp" alt="Práxis" />
        </div>

        {success ? (
          <div className="password-success p1-password-success">
            <div className="p1-success-icon"><CheckCircle2 size={32} /></div>
            <span className="p1-entry-kicker"><ShieldCheck size={15} /> Senha atualizada</span>
            <h1>Alteração concluída</h1>
            <p>A nova senha já está ativa e as demais sessões desta conta foram encerradas.</p>
            <button className="button primary auth-submit p1-entry-primary" onClick={() => void onDone()}>
              Entrar com a nova senha
            </button>
          </div>
        ) : (
          <>
            <div className="p1-entry-heading">
              <span className="p1-entry-kicker"><ShieldCheck size={15} /> Recuperação de acesso</span>
              <h1>Cadastre uma nova senha</h1>
              <p>O link de recuperação foi validado. Informe a nova senha duas vezes para concluir.</p>
            </div>

            <form className="p1-entry-form" onSubmit={submit}>
              <label>
                Nova senha
                <div className="input-with-icon p1-entry-input">
                  <LockKeyhole size={18} />
                  <input
                    autoFocus
                    required
                    minLength={8}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Mínimo de 8 caracteres"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar ou ocultar senha">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label>
                Confirmar nova senha
                <div className="input-with-icon p1-entry-input">
                  <LockKeyhole size={18} />
                  <input
                    required
                    minLength={8}
                    type={showPassword ? "text" : "password"}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Repita a nova senha"
                  />
                </div>
              </label>

              {message && <div className="auth-message p1-entry-message">{message}</div>}

              <button
                className="button primary auth-submit p1-entry-primary"
                disabled={busy || password.length < 8 || confirmation.length < 8}
              >
                {busy ? "Alterando..." : "Alterar senha"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
