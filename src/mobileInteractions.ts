import { useEffect, useRef, useState } from "react";

type HapticKind = "tap" | "success" | "warning";

export function hapticFeedback(kind: HapticKind = "tap"): void {
  if (!("vibrate" in navigator)) return;
  const pattern = kind === "success" ? [12, 35, 18] : kind === "warning" ? [24, 30, 24] : 12;
  try { navigator.vibrate(pattern); } catch { /* Recurso opcional do navegador. */ }
}

interface MobileNavigationOptions {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onRefresh: () => Promise<void>;
}

export function useMobileNavigation({ sidebarOpen, onOpenSidebar, onCloseSidebar, onRefresh }: MobileNavigationOptions) {
  const touch = useRef({ x: 0, y: 0, edge: false, sidebar: false, pulling: false });
  const callbacks = useRef({ sidebarOpen, onOpenSidebar, onCloseSidebar, onRefresh });
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  callbacks.current = { sidebarOpen, onOpenSidebar, onCloseSidebar, onRefresh };

  function updatePullDistance(value: number) {
    pullDistanceRef.current = value;
    setPullDistance(value);
  }

  function updateRefreshing(value: boolean) {
    refreshingRef.current = value;
    setRefreshing(value);
  }

  useEffect(() => {
    const interactive = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest("input, textarea, select, [data-no-pull]"));

    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const point = event.touches[0];
      touch.current = {
        x: point.clientX,
        y: point.clientY,
        edge: !callbacks.current.sidebarOpen && point.clientX <= 28,
        sidebar: callbacks.current.sidebarOpen && event.target instanceof Element && Boolean(event.target.closest(".sidebar")),
        pulling: !callbacks.current.sidebarOpen && window.scrollY <= 0 && !interactive(event.target),
      };
    };

    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !touch.current.pulling || refreshingRef.current) return;
      const point = event.touches[0];
      const deltaY = point.clientY - touch.current.y;
      const deltaX = Math.abs(point.clientX - touch.current.x);
      if (deltaY <= 0 || deltaX > deltaY) return;
      const distance = Math.min(96, Math.round(deltaY * 0.48));
      updatePullDistance(distance);
      if (distance > 6) event.preventDefault();
    };

    const end = (event: TouchEvent) => {
      const point = event.changedTouches[0];
      if (!point) return;
      const deltaX = point.clientX - touch.current.x;
      const deltaY = point.clientY - touch.current.y;
      if (touch.current.edge && deltaX >= 72 && Math.abs(deltaY) <= 64) {
        hapticFeedback();
        callbacks.current.onOpenSidebar();
      }
      if (touch.current.sidebar && deltaX <= -72 && Math.abs(deltaY) <= 64) {
        hapticFeedback();
        callbacks.current.onCloseSidebar();
      }
      if (pullDistanceRef.current >= 72 && !refreshingRef.current) {
        updateRefreshing(true);
        updatePullDistance(56);
        hapticFeedback();
        void callbacks.current.onRefresh()
          .then(() => hapticFeedback("success"))
          .catch(() => hapticFeedback("warning"))
          .finally(() => {
            updateRefreshing(false);
            updatePullDistance(0);
          });
      } else if (!refreshingRef.current) {
        updatePullDistance(0);
      }
    };

    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  return { pullDistance, refreshing };
}
