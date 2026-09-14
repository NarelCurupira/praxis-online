import { useEffect, useState } from "react";
import { endLocalSession } from "./sessionLifecycle";

export const IDLE_LIMIT = 4 * 60 * 60 * 1000;
export function isIdleExpired(last: number, now: number): boolean {
  return Number.isFinite(last) && last > 0 && now - last >= IDLE_LIMIT;
}
export function useIdleSession(userId: string) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const key = `praxis-last-activity:${userId}`;
    let lastSaved = 0;
    let memoryLast = Date.now();
    let ending = false;
    const readLast = () => { try { return Number(localStorage.getItem(key)) || memoryLast; } catch { return memoryLast; } };
    const check = () => {
      if (ending) return true;
      if (!isIdleExpired(readLast(), Date.now())) return false;
      ending = true;
      setExpired(true);
      void endLocalSession().finally(() => { try { localStorage.removeItem(key); } catch { /* Sem armazenamento. */ } });
      return true;
    };
    const touch = () => {
      if (check()) return;
      const now = Date.now();
      if (now - lastSaved < 30_000) return;
      memoryLast = now; lastSaved = now;
      try { localStorage.setItem(key, String(now)); } catch { /* Usa memória. */ }
    };
    // Verifica a atividade anterior antes de renová-la, inclusive após suspensão do celular.
    if (!check()) touch();
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach(name => window.addEventListener(name, touch, { passive: true }));
    const onVisibility = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onVisibility);
    const timer = window.setInterval(check, 30_000);
    return () => {
      events.forEach(name => window.removeEventListener(name, touch));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onVisibility);
      window.clearInterval(timer);
    };
  }, [userId]);
  return expired;
}
