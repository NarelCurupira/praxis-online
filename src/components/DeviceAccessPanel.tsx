import { Fingerprint, KeyRound, LoaderCircle, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { detectPasskeyCapability, friendlyPasskeyError, isPasskeyEnabledForThisBrowser, setPasskeyEnabledForThisBrowser, type PasskeyCapability } from "../passkeySupport";
import { requireSupabase } from "../supabase";

type PasskeyItem = {
  id: string;
  friendly_name?: string | null;
  friendlyName?: string | null;
  created_at?: string;
  createdAt?: string;
  last_used_at?: string | null;
  lastUsedAt?: string | null;
};

function dateLabel(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function DeviceAccessPanel() {
  const [capability, setCapability] = useState<PasskeyCapability | null>(null);
  const [enabled, setEnabled] = useState(() => isPasskeyEnabledForThisBrowser());
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPasskeys() {
    const client = requireSupabase();
    const api = client.auth as typeof client.auth & { passkey?: { list: () => Promise<{ data?: PasskeyItem[]; error?: Error | null }> } };
    if (!api.passkey?.list) return;
    const result = await api.passkey.list();
    if (result.error) throw result.error;
    setPasskeys(Array.isArray(result.data) ? result.data : []);
  }

  useEffect(() => {
    detectPasskeyCapability().then(setCapability);
    loadPasskeys().catch(() => undefined);
  }, []);

  async function enableBiometrics() {
    if (!capability?.supported) return;
    setBusy(true); setMessage("");
    try {
      const client = requireSupabase();
      const auth = client.auth as typeof client.auth & { registerPasskey?: () => Promise<{ data?: PasskeyItem; error?: Error | null }> };
      if (!passkeys.length) {
        if (!auth.registerPasskey) throw new Error("Atualize a biblioteca do Supabase para habilitar passkeys.");
        const result = await auth.registerPasskey();
        if (result.error) throw result.error;
      }
      setPasskeyEnabledForThisBrowser(true);
      setEnabled(true);
      await loadPasskeys();
      setMessage(`Acesso por ${capability.deviceLabel} habilitado neste navegador.`);
    } catch (error) {
      setMessage(friendlyPasskeyError(error));
    } finally { setBusy(false); }
  }

  function disableForBrowser() {
    setPasskeyEnabledForThisBrowser(false);
    setEnabled(false);
    setMessage("O botão biométrico foi desativado neste navegador. As credenciais cadastradas não foram apagadas.");
  }

  async function removePasskey(id: string) {
    if (!confirm("Excluir esta credencial biométrica? Ela deixará de funcionar nos dispositivos que a utilizam.")) return;
    setBusy(true); setMessage("");
    try {
      const client = requireSupabase();
      const api = client.auth as typeof client.auth & { passkey?: { delete: (input: { passkeyId: string }) => Promise<{ error?: Error | null }> } };
      if (!api.passkey?.delete) throw new Error("O gerenciamento de passkeys não está disponível.");
      const result = await api.passkey.delete({ passkeyId: id });
      if (result.error) throw result.error;
      await loadPasskeys();
      if (passkeys.length <= 1) {
        setPasskeyEnabledForThisBrowser(false);
        setEnabled(false);
      }
      setMessage("Credencial biométrica excluída.");
    } catch (error) { setMessage(friendlyPasskeyError(error)); }
    finally { setBusy(false); }
  }

  if (!capability) return <section className="device-access-panel"><LoaderCircle className="spin" /><span>Verificando biometria do dispositivo...</span></section>;

  return <section className="device-access-panel">
    <div className="device-access-title"><span className="device-access-icon"><Fingerprint /></span><div><h2>Acesso por biometria</h2><p>A preferência fica salva somente neste navegador. A credencial privada permanece protegida pelo sistema do dispositivo ou pelo gerenciador de passkeys.</p></div></div>
    {!capability.eligibleDevice && <div className="device-access-unavailable"><Smartphone size={20} /><span>Por opção do Práxis, este recurso é oferecido apenas no Mac, iPhone, iPad e celulares Android.</span></div>}
    {capability.eligibleDevice && !capability.supported && <div className="device-access-unavailable"><KeyRound size={20} /><span>Este navegador não encontrou um autenticador biométrico disponível ou a página não está em HTTPS.</span></div>}
    {capability.supported && <>
      <div className="device-access-actions">
        <div><strong>{enabled ? `${capability.deviceLabel} ativo neste navegador` : "Biometria desativada neste navegador"}</strong><small>O acesso com e-mail e senha permanece disponível para recuperação.</small></div>
        {enabled
          ? <button type="button" className="button secondary" disabled={busy} onClick={disableForBrowser}>Desativar neste navegador</button>
          : <button type="button" className="button primary" disabled={busy} onClick={enableBiometrics}>{busy ? "Aguarde..." : `Ativar ${capability.deviceLabel}`}</button>}
      </div>
      {passkeys.length > 0 && <div className="passkey-list"><h3>Credenciais cadastradas</h3>{passkeys.map((item) => {
        const name = item.friendly_name ?? item.friendlyName ?? "Passkey";
        const created = item.created_at ?? item.createdAt;
        const used = item.last_used_at ?? item.lastUsedAt;
        return <div className="passkey-row" key={item.id}><KeyRound size={18} /><span><strong>{name}</strong><small>Criada em {dateLabel(created)}{used ? ` · último uso em ${dateLabel(used)}` : ""}</small></span><button type="button" className="icon-button danger" disabled={busy} title="Excluir credencial" onClick={() => removePasskey(item.id)}><Trash2 size={17} /></button></div>;
      })}</div>}
    </>}
    {message && <div className="device-access-message">{message}</div>}
  </section>;
}
