import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { canRegisterServiceWorker, isIosDevice, isMacSafari, isStandaloneMode, isSupportedPwaInstallDevice } from "../pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaManager() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const [dismissedInstall, setDismissedInstall] = useState(false);
  const reloading = useRef(false);
  const updateRequested = useRef(false);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onControllerChange = () => {
      if (!updateRequested.current || reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    if (canRegisterServiceWorker()) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (registration.waiting) setUpdateWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateWorker(worker);
          });
        });
      }).catch(() => undefined);
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    }

    return () => {
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function update() {
    if (document.querySelector(".modal-backdrop, [aria-modal=true]") || document.documentElement.dataset.praxisBusy === "true") {
      setUpdateMessage("Conclua a edição ou sincronização em andamento antes de atualizar.");
      return;
    }
    updateRequested.current = true;
    updateWorker?.postMessage({ type: "SKIP_WAITING" });
  }

  const standalone = isStandaloneMode();
  const supportedInstallDevice = isSupportedPwaInstallDevice(navigator.userAgent);
  const showInstall = Boolean(supportedInstallDevice && installPrompt && !dismissedInstall && !standalone);
  const showIosHint = !showInstall && !dismissedInstall && isIosDevice(navigator.userAgent) && !standalone;
  const showMacSafariHint = !showInstall && !showIosHint && !dismissedInstall && isMacSafari(navigator.userAgent) && !standalone;

  return <div className="pwa-notices" aria-live="polite">
    {!online && <div className="pwa-notice offline"><WifiOff size={18} /><span><strong>Sem conexão</strong> Consulte os dados já salvos neste dispositivo. Alterações permitidas ficam na fila local até a sincronização.</span></div>}
    {updateWorker && <div className="pwa-notice update"><RefreshCw size={18} /><span><strong>Nova versão disponível.</strong> {updateMessage || "Conclua suas edições e atualize para aplicar as correções."}</span><button type="button" onClick={update}>Atualizar agora</button></div>}
    {showInstall && <div className="pwa-notice install"><Download size={18} /><span><strong>Instalar o Práxis</strong> Use o aplicativo em uma janela própria no Mac ou celular.</span><button type="button" onClick={install}>Instalar</button><button type="button" className="notice-close" onClick={() => setDismissedInstall(true)} aria-label="Dispensar"><X size={16} /></button></div>}
    {showIosHint && <div className="pwa-notice install ios"><Download size={18} /><span>No iPhone ou iPad, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</span><button type="button" className="notice-close" onClick={() => setDismissedInstall(true)} aria-label="Dispensar"><X size={16} /></button></div>}
    {showMacSafariHint && <div className="pwa-notice install ios"><Download size={18} /><span>No Safari do Mac, use <strong>Arquivo → Adicionar ao Dock</strong>.</span><button type="button" className="notice-close" onClick={() => setDismissedInstall(true)} aria-label="Dispensar"><X size={16} /></button></div>}
  </div>;
}
