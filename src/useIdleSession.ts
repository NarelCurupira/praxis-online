import { useEffect } from "react";
import { requireSupabase } from "./supabase";

const IDLE_LIMIT = 4 * 60 * 60 * 1000;
const STORAGE_KEY = "praxis-last-activity";

export function useIdleSession() {
  useEffect(() => {
    let lastSaved = 0;
    const touch = () => { const now = Date.now(); if (now - lastSaved > 30_000) { localStorage.setItem(STORAGE_KEY, String(now)); lastSaved = now; } };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true })); touch();
    const timer = window.setInterval(() => {
      const last = Number(localStorage.getItem(STORAGE_KEY) || Date.now());
      if (Date.now() - last >= IDLE_LIMIT) { localStorage.removeItem(STORAGE_KEY); void requireSupabase().auth.signOut(); }
    }, 60_000);
    return () => { events.forEach((name) => window.removeEventListener(name, touch)); window.clearInterval(timer); };
  }, []);
}
