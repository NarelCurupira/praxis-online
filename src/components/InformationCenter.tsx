import { Bell, CheckCheck, CircleAlert, ExternalLink, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  pokePushDelivery,
  subscribeNotifications,
  type PraxisNotification,
} from "../notificationApi";

interface Props {
  userId: string;
  online: boolean;
  onOpenNotification: (notification: PraxisNotification) => Promise<void> | void;
}

const CENTRAL_RETRY_DELAYS_MS = [3000, 6000, 12000, 15000];

function when(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function isTransientCentralFailure(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLocaleLowerCase("pt-BR");
  return /failed to fetch|fetch failed|network|load failed|timeout|timed out|connection|gateway|\b521\b|\b502\b|\b503\b|\b504\b/.test(message);
}

export function InformationCenter({ userId, online, onOpenNotification }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PraxisNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const retryTimer = useRef<number | null>(null);
  const retryAttempt = useRef(0);
  const refreshInFlight = useRef(false);
  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  function clearRetry() {
    if (retryTimer.current != null) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }

  function scheduleRetry() {
    clearRetry();
    if (!mounted.current || !navigator.onLine) return;
    const attempt = Math.min(retryAttempt.current, CENTRAL_RETRY_DELAYS_MS.length - 1);
    const delay = CENTRAL_RETRY_DELAYS_MS[attempt];
    retryAttempt.current += 1;
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null;
      if (mounted.current && navigator.onLine) void refresh(true);
    }, delay);
  }

  async function refresh(isAutomaticRetry = false) {
    if (!online || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    if (!isAutomaticRetry) {
      clearRetry();
      retryAttempt.current = 0;
    }
    setError("");
    try {
      const next = await listNotifications();
      if (mounted.current) {
        setItems(next);
        setError("");
        retryAttempt.current = 0;
        clearRetry();
      }
      void pokePushDelivery().catch(() => undefined);
    } catch (err) {
      if (mounted.current) {
        if (isTransientCentralFailure(err)) {
          setError("Central temporariamente indisponível. Tentando reconectar…");
          scheduleRetry();
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      refreshInFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (online) void refresh();
    else {
      clearRetry();
      retryAttempt.current = 0;
    }
    return () => {
      mounted.current = false;
      clearRetry();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, online]);

  useEffect(() => {
    if (!online) return;
    const channel = subscribeNotifications(userId, (item) => {
      setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 100));
    });
    return () => { void channel.unsubscribe(); };
  }, [userId, online]);

  useEffect(() => {
    const openFromProductShell = () => {
      setOpen(true);
      if (online) void refresh();
    };
    window.addEventListener("praxis:open-information-center", openFromProductShell);
    return () => window.removeEventListener("praxis:open-information-center", openFromProductShell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function read(item: PraxisNotification) {
    setError("");
    try {
      if (!item.readAt && online) {
        await markNotificationRead(item.id);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
      }
      await onOpenNotification(item);
      setOpen(false);
    } catch (err) {
      if (isTransientCentralFailure(err)) {
        setError("Central temporariamente indisponível. Tentando reconectar…");
        scheduleRetry();
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function readAll() {
    if (!online || !unread) return;
    try {
      await markAllNotificationsRead();
      const timestamp = new Date().toISOString();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: timestamp }));
    } catch (err) {
      if (isTransientCentralFailure(err)) {
        setError("Central temporariamente indisponível. Tentando reconectar…");
        scheduleRetry();
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  return <div className="information-center">
    <button
      type="button"
      className={`icon-button information-center-trigger ${unread ? "has-unread" : ""}`}
      title="Central de Informações"
      aria-label={`Central de Informações${unread ? `, ${unread} não lida${unread === 1 ? "" : "s"}` : ""}`}
      onClick={() => { setOpen((value) => !value); if (!open && online) void refresh(); }}
    >
      <Bell />
      {unread > 0 && <span className="information-center-badge">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <>
      <button type="button" className="information-center-backdrop" aria-label="Fechar Central de Informações" onClick={() => setOpen(false)} />
      <section className="information-center-panel" aria-label="Central de Informações">
        <header>
          <div><strong>Central de Informações</strong><span>{unread ? `${unread} não lida${unread === 1 ? "" : "s"}` : "Tudo em dia"}</span></div>
          <div className="information-center-header-actions">
            <button type="button" className="icon-button" title="Atualizar" disabled={!online || loading} onClick={() => void refresh()}><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
            <button type="button" className="icon-button" title="Marcar todas como lidas" disabled={!online || !unread} onClick={() => void readAll()}><CheckCheck size={18} /></button>
            <button type="button" className="icon-button" title="Fechar" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>
        </header>
        {!online && <div className="information-center-offline"><CircleAlert size={17} /><span>Sem conexão: a Central não altera nem substitui dados da contingência. As informações serão atualizadas na reconexão.</span></div>}
        {error && <div className="information-center-error">{error}</div>}
        <div className="information-center-list">
          {!items.length && !loading && !error && <div className="information-center-empty"><Bell size={28} /><strong>Nenhuma informação nova</strong><span>Atribuições, transferências e atualizações relevantes aparecerão aqui.</span></div>}
          {items.map((item) => <button type="button" key={item.id} className={`information-item severity-${item.severity} ${item.readAt ? "read" : "unread"}`} onClick={() => void read(item)}>
            <span className="information-item-dot" />
            <span className="information-item-main">
              <span className="information-item-title">{item.title}</span>
              <span className="information-item-body">{item.body}</span>
              <span className="information-item-meta">{item.workspaceName}{item.processNumber ? ` · ${item.processNumber}` : ""} · {when(item.createdAt)}</span>
            </span>
            {item.movementId && <ExternalLink size={15} className="information-item-open" />}
          </button>)}
        </div>
      </section>
    </>}
  </div>;
}
