import { useEffect, useRef } from "react";

export function useModalFocus(onClose: () => void, busy: boolean) {
  const ref = useRef<HTMLFormElement>(null);
  const state = useRef({ onClose, busy });
  state.current = { onClose, busy };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const form = ref.current;
    if (!form) return;
    const focusable = () => [...form.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(item => item.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !state.current.busy) { event.preventDefault(); state.current.onClose(); }
      if (event.key !== "Tab") return;
      const items = focusable(); const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    form.addEventListener("keydown", keyboard);
    return () => { form.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, []);
  return ref;
}
