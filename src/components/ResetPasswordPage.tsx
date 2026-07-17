import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { requireSupabase } from "../supabase";

export function ResetPasswordPage({ onDone }: { onDone: () => Promise<void> }) {
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [success, setSuccess] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage("");
    if (password !== confirmation) { setMessage("As senhas informadas não são iguais."); return; }
    setBusy(true);
    try {
      const client = requireSupabase();
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      await client.auth.signOut({ scope: "others" });
      setSuccess(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <div className="auth-shell"><section className="auth-card reset-card"><img src="/praxis-logo.png" alt="Práxis — Controle de Processos" />{success ? <div className="password-success"><CheckCircle2 size={44} /><p className="eyebrow">Senha atualizada</p><h1>Alteração concluída</h1><p>A nova senha já está ativa e as demais sessões desta conta foram encerradas.</p><button className="button primary auth-submit" onClick={() => void onDone()}>Entrar com a nova senha</button></div> : <><p className="eyebrow">Recuperação de acesso</p><h1>Cadastre uma nova senha</h1><p>O link de recuperação foi validado. Informe a nova senha duas vezes para concluir.</p><form onSubmit={submit}><label>Nova senha<div className="input-with-icon"><LockKeyhole size={18} /><input autoFocus required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar ou ocultar senha">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><label>Confirmar nova senha<div className="input-with-icon"><LockKeyhole size={18} /><input required minLength={8} type={showPassword ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" /></div></label>{message && <div className="auth-message">{message}</div>}<button className="button primary auth-submit" disabled={busy || password.length < 8 || confirmation.length < 8}>{busy ? "Alterando..." : "Alterar senha"}</button></form></>}</section></div>;
}
