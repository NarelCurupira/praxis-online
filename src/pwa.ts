export const PWA_INSTALL_EVENT = "praxis:pwa-install-available";
export const PWA_UPDATE_EVENT = "praxis:pwa-update-available";

export function isStandaloneMode(matchMediaValue?: boolean, navigatorStandalone?: boolean): boolean {
  if (typeof matchMediaValue === "boolean" || typeof navigatorStandalone === "boolean") {
    return Boolean(matchMediaValue || navigatorStandalone);
  }
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return standalone || iosStandalone;
}

export function isIosDevice(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

export function canRegisterServiceWorker(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator;
}

export function isMacSafari(userAgent: string): boolean {
  return /Macintosh/i.test(userAgent) && /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg|OPR/i.test(userAgent);
}
