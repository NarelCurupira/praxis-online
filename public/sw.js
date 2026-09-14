const CACHE_NAME = "praxis-shell-1.1.0-dev";
// Substituído pelo build com todos os arquivos e um identificador de conteúdo.
const SHELL = ["/", "/index.html", "/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Conserva a versão anterior para abas que ainda estão abertas.
    const keys = (await caches.keys()).filter((key) => key.startsWith("praxis-shell-"));
    const previous = keys.filter((key) => key !== CACHE_NAME).slice(-1);
    await Promise.all(keys.filter((key) => key !== CACHE_NAME && !previous.includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/sw.js") return;
  if (request.mode !== "navigate" && !SHELL.includes(url.pathname) && !url.pathname.startsWith("/assets/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // HTML e chunks vêm da mesma versão, inclusive em uma rede instável.
    const cached = await cache.match(request.mode === "navigate" ? "/index.html" : url.pathname);
    if (cached) return cached;
    const previous = await caches.match(request);
    if (previous) return previous;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; }
  catch { payload = { title: "Práxis", body: event.data?.text() ?? "Há uma nova informação no Práxis." }; }

  const title = payload.title || "Práxis";
  const body = payload.body || "Há uma nova informação na Central do Práxis.";
  const tag = payload.notificationId ? `praxis-${payload.notificationId}` : "praxis-information";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
    renotify: Boolean(payload.severity === "urgent"),
    data: {
      url: payload.url || "/",
      notificationId: payload.notificationId || null,
      workspaceId: payload.workspaceId || null,
      movementId: payload.movementId || null,
    },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = new URL(event.notification.data?.url || "/", self.location.origin);
  const targetUrl = requested.origin === self.location.origin ? requested.href : self.location.origin + "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) {
        try { await client.navigate(targetUrl); } catch { /* usa abertura abaixo */ }
      }
      if ("focus" in client) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
