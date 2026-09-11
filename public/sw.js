const CACHE_NAME = "praxis-shell-1.0.0-push-1";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/brand/praxis-1-logo-light.webp",
  "/brand/praxis-1-logo-dark.webp",
  "/brand/praxis-1-mark.webp",
  "/brand/symbol-light.webp",
  "/brand/symbol-dark.webp",
  "/brand/empty-processes.webp",
  "/brand/empty-search.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("praxis-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await cache.match("/") ?? await cache.match("/index.html");
      if (shell) return shell;
      const offline = await cache.match("/offline.html");
      if (offline) return offline;
    }
    throw new Error("Recurso indisponível na rede e no cache.");
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/")) return;

  if (
    request.mode === "navigate"
    || request.destination === "script"
    || request.destination === "style"
    || url.pathname === "/sw.js"
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
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
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
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
