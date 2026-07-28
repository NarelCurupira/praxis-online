import { Fingerprint, KeyRound, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  confirmWithPasskey,
  confirmWithTotp,
  strongAuthenticationAvailability,
  type StrongAuthenticationAvailability,
} from "../strongAuthentication";

interface Props {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirmed: () => void | Promise<void>;
}

export function StrongAuthDialog({ title, description, onCancel, onConfirmed }: Props) {
  const [available, setAvailable] = useState<StrongAuthenticationAvailability>({ passkey: false, totp: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    strongAuthenticationAvailability()
      .then(setAvailable)
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false));
  }, []);

  async function finish(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await onConfirmed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop"><div className="confirm-dialog strong-auth-dialog">
    <div className="modal-head"><div><p className="eyebrow">Confirmação de segurança</p><h2>{title}</h2></div><button className="icon-button" onClick={onCancel} disabled={busy}><X size={20} /></button></div>
    <div className="confirm-body strong-auth-body"><div className="strong-auth-intro"><ShieldCheck size={26} /><p>{description}</p></div>
      {loading ? <p className="muted">Verificando os métodos disponíveis...</p> : <>
        {available.passkey && <button type="button" className="button biometric-login strong-auth-passkey" disabled={busy} onClick={() => void finish(confirmWithPasskey)}><Fingerprint size={20} />Confirmar com biometria ou passkey</button>}
        {available.passkey && available.totp && <div className="auth-divider"><span>ou</span></div>}
        {available.totp && <form className="strong-auth-totp" onSubmit={(event) => { event.preventDefault(); void finish(() => confirmWithTotp(code)); }}>
          <label>Código do autenticador<div className="input-with-icon"><KeyRound size={18} /><input autoFocus={!available.passkey} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /></div></label>
          <button className="button primary" disabled={busy || code.length !== 6}>{busy ? "Verificando..." : "Confirmar com código"}</button>
        </form>}
        {!available.passkey && !available.totp && <div className="auth-message">Nenhum método forte de confirmação está disponível nesta conta ou navegador.</div>}
      </>}
      {message && <div className="auth-message">{message}</div>}
    </div>
    <div className="modal-actions"><button className="button secondary" onClick={onCancel} disabled={busy}>Cancelar</button></div>
  </div></div>;
}
