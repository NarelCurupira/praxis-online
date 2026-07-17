import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { requireSupabase } from "../supabase";

export function MfaGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false); const [factorId, setFactorId] = useState(""); const [qr, setQr] = useState(""); const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { void prepare(); }, []);
  async function prepare() {
    const client = requireSupabase();
    const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel === "aal2") { setReady(true); return; }
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) { setMessage(error.message); return; }
    const verified = data.totp.find((item) => item.status === "verified");
    if (verified) { setFactorId(verified.id); return; }
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Práxis Administrador" });
    if (enrolled.error) { setMessage(enrolled.error.message); return; }
    setFactorId(enrolled.data.id); setQr(enrolled.data.totp.qr_code);
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); if (!factorId || code.length !== 6) return; setBusy(true); setMessage("");
    const client = requireSupabase();
    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error) { setMessage(challenge.error.message); setBusy(false); return; }
    const result = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (result.error) setMessage(result.error.message); else setReady(true); setBusy(false);
  }
  if (ready) return <>{children}</>;
  return <div className="auth-shell"><section className="auth-card mfa-card"><div className="mfa-icon"><ShieldCheck size={34} /></div><p className="eyebrow">Proteção administrativa</p><h1>Verificação em duas etapas</h1><p>{qr ? "Escaneie o QR Code com o recurso Senhas do iPhone ou com o Google Authenticator. Depois, informe o código de seis dígitos." : "Informe o código atual do seu autenticador para acessar as funções administrativas."}</p>{qr && <img className="mfa-qr" src={qr} alt="QR Code para configurar o autenticador" />}<form onSubmit={verify}><label>Código do autenticador<div className="input-with-icon"><KeyRound size={18} /><input autoFocus required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /></div></label>{message && <div className="auth-message">{message}</div>}<button className="button primary auth-submit" disabled={busy || code.length !== 6}>{busy ? "Verificando..." : "Verificar e entrar"}</button></form><button className="auth-switch" onClick={() => requireSupabase().auth.signOut()}>Sair desta conta</button></section></div>;
}
