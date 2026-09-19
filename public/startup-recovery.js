(() => {
  const WATCHDOG_MS = 10000;
  const OVERLAY_ID = "praxis-startup-recovery";
  const PASSKEY_SESSION_KEY = "praxis-authenticated-with-passkey";
  const BOOT_MESSAGES = [
    "Verificando acesso seguro",
    "Preparando o Práxis",
    "Preparando seus processos",
  ];

  function rootText() {
    return document.getElementById("root")?.textContent?.trim() || "";
  }

  function isStillBooting() {
    const text = rootText();
    return BOOT_MESSAGES.some((message) => text.includes(message));
  }

  function clearSupabaseAuthStorage() {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && /^sb-[a-z0-9]+-auth-token(?:\..+)?$/i.test(key)) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch {
      // A recuperação deve continuar mesmo quando o WebKit bloqueia o storage.
    }

    try {
      sessionStorage.removeItem(PASSKEY_SESSION_KEY);
    } catch {
      // Sem armazenamento de sessão disponível.
    }
  }

  async function resetPwaRuntime() {
    try {
      if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch {
      // O reload com cache-busting continua válido mesmo sem desregistro.
    }

    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith("praxis-shell-"))
            .map((name) => caches.delete(name)),
        );
      }
    } catch {
      // Cache Storage pode estar indisponível em alguns contextos WebKit.
    }
  }

  function recoveryUrl() {
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("_praxis_recover", String(Date.now()));
    return url.toString();
  }

  function addStyles() {
    if (document.getElementById(`${OVERLAY_ID}-styles`)) return;
    const style = document.createElement("style");
    style.id = `${OVERLAY_ID}-styles`;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(6, 22, 41, 0.94);
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${OVERLAY_ID} .praxis-recovery-card {
        width: min(100%, 430px);
        border-radius: 18px;
        padding: 22px;
        background: #0f2742;
        border: 1px solid rgba(255,255,255,.14);
        box-shadow: 0 24px 70px rgba(0,0,0,.36);
      }
      #${OVERLAY_ID} h1 { margin: 0 0 10px; font-size: 21px; }
      #${OVERLAY_ID} p { margin: 0 0 16px; line-height: 1.5; color: #d8e2ee; }
      #${OVERLAY_ID} .praxis-recovery-actions { display: grid; gap: 10px; }
      #${OVERLAY_ID} button {
        min-height: 46px;
        border: 0;
        border-radius: 12px;
        padding: 11px 14px;
        font: inherit;
        font-weight: 700;
      }
      #${OVERLAY_ID} .primary { background: #f8fafc; color: #0a2b52; }
      #${OVERLAY_ID} .secondary { background: rgba(255,255,255,.1); color: #f8fafc; }
      #${OVERLAY_ID} small { display: block; margin-top: 14px; color: #aebfd1; line-height: 1.4; }
    `;
    document.head.appendChild(style);
  }

  function showRecovery() {
    if (document.getElementById(OVERLAY_ID)) return;
    addStyles();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <section class="praxis-recovery-card">
        <h1>O Práxis demorou para iniciar</h1>
        <p>Este dispositivo pode estar preso a uma sessão local ou a um cache antigo. Você pode tentar novamente ou recuperar somente o estado local do Práxis.</p>
        <div class="praxis-recovery-actions">
          <button type="button" class="primary" data-action="recover">Recuperar acesso neste dispositivo</button>
          <button type="button" class="secondary" data-action="retry">Tentar novamente</button>
        </div>
        <small>A recuperação remove a sessão local do Supabase e o cache do PWA deste navegador. Ela não apaga os dados do servidor.</small>
      </section>
    `;

    overlay.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      window.location.reload();
    });

    overlay.querySelector('[data-action="recover"]')?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      if (button instanceof HTMLButtonElement) {
        button.disabled = true;
        button.textContent = "Recuperando…";
      }
      clearSupabaseAuthStorage();
      await resetPwaRuntime();
      window.location.replace(recoveryUrl());
    });

    document.body.appendChild(overlay);
  }

  window.setTimeout(() => {
    if (isStillBooting()) showRecovery();
  }, WATCHDOG_MS);
})();
