import { Bell, BellOff, Check, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import {
  countRegisteredPushDevices,
  currentPushSubscription,
  getNotificationPreferences,
  registerCurrentPushSubscription,
  saveNotificationPreferences,
  supportsWebPush,
  unregisterCurrentPushSubscription,
  type NotificationPreferences,
} from "../notificationApi";
import { isIosDevice, isStandaloneMode } from "../pwa";

const initialPreferences: NotificationPreferences = {
  pushEnabled: true,
  pushAssignments: true,
  pushTransfers: true,
  pushStatus: false,
  pushDeadlines: false,
};

export function PushSettingsPanel() {
  const [supported] = useState(() => supportsWebPush());
  const [subscribed, setSubscribed] = useState(false);
  const [devices, setDevices] = useState(0);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const iosNeedsInstall = isIosDevice(navigator.userAgent) && !isStandaloneMode();

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const prefs = await getNotificationPreferences();
      setPreferences(prefs);
      if (supported) setSubscribed(Boolean(await currentPushSubscription()));
      setDevices(await countRegisteredPushDevices());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function subscribe() {
    setBusy(true); setMessage("");
    try {
      await registerCurrentPushSubscription();
      const next = { ...preferences, pushEnabled: true };
      await saveNotificationPreferences(next);
      setPreferences(next);
      setSubscribed(true);
      setDevices(await countRegisteredPushDevices());
      setMessage("Notificações Push ativadas neste dispositivo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function unsubscribe() {
    setBusy(true); setMessage("");
    try {
      await unregisterCurrentPushSubscription();
      setSubscribed(false);
      setDevices(await countRegisteredPushDevices());
      setMessage("Este dispositivo deixou de receber Push. A Central de Informações permanece ativa.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setMessage("");
    try {
      await saveNotificationPreferences(preferences);
      setMessage("Preferências de notificação atualizadas.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  return <section className="settings-card push-settings-card">
    <div className="settings-card-heading">
      <div className="settings-icon"><Bell size={20} /></div>
      <div><h2>Notificações e Push</h2><p>A Central funciona dentro do Práxis. O Push é opcional e avisa mesmo com o aplicativo em segundo plano.</p></div>
    </div>

    {iosNeedsInstall && <div className="info-box">No iPhone/iPad, o Push exige que o Práxis seja adicionado à Tela de Início e aberto como aplicativo.</div>}
    {!supported && !iosNeedsInstall && <div className="info-box">Este navegador não oferece Web Push. A Central de Informações continuará disponível normalmente.</div>}

    <div className="push-device-row">
      <div><Smartphone size={18} /><span><strong>{subscribed ? "Este dispositivo está inscrito" : "Push desativado neste dispositivo"}</strong><small>{devices} dispositivo{devices === 1 ? "" : "s"} ativo{devices === 1 ? "" : "s"} na sua conta.</small></span></div>
      {supported && !iosNeedsInstall && (subscribed
        ? <button type="button" className="button secondary compact" disabled={busy} onClick={() => void unsubscribe()}><BellOff size={16} />Desativar neste dispositivo</button>
        : <button type="button" className="button primary compact" disabled={busy} onClick={() => void subscribe()}><Bell size={16} />Ativar Push</button>)}
    </div>

    <div className="push-preferences">
      <label><input type="checkbox" checked={preferences.pushEnabled} onChange={(event) => setPreferences((value) => ({ ...value, pushEnabled: event.target.checked }))} /><span><strong>Permitir Push</strong><small>Chave geral da conta. A Central continua funcionando se estiver desligada.</small></span></label>
      <label><input type="checkbox" checked={preferences.pushAssignments} disabled={!preferences.pushEnabled} onChange={(event) => setPreferences((value) => ({ ...value, pushAssignments: event.target.checked }))} /><span><strong>Atribuições</strong><small>Novo processo ou redistribuição para sua fila.</small></span></label>
      <label><input type="checkbox" checked={preferences.pushTransfers} disabled={!preferences.pushEnabled} onChange={(event) => setPreferences((value) => ({ ...value, pushTransfers: event.target.checked }))} /><span><strong>Transferências</strong><small>Processo transferido para uma Procuradoria em que você atua.</small></span></label>
      <label><input type="checkbox" checked={preferences.pushStatus} disabled={!preferences.pushEnabled} onChange={(event) => setPreferences((value) => ({ ...value, pushStatus: event.target.checked }))} /><span><strong>Mudanças de status</strong><small>Desativado por padrão para evitar excesso de alertas.</small></span></label>
      <label><input type="checkbox" checked={preferences.pushDeadlines} disabled={!preferences.pushEnabled} onChange={(event) => setPreferences((value) => ({ ...value, pushDeadlines: event.target.checked }))} /><span><strong>Alterações de prazo</strong><small>Notifica quando outra pessoa altera o prazo de processo atribuído a você.</small></span></label>
    </div>

    <div className="push-settings-actions"><button type="button" className="button secondary compact" disabled={busy} onClick={() => void load()}><RefreshCw size={15} />Atualizar</button><button type="button" className="button primary compact" disabled={busy} onClick={() => void save()}><Check size={15} />Salvar preferências</button></div>
    {message && <div className="settings-message">{message}</div>}
  </section>;
}
