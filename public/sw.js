const CACHE_NAME = "praxis-shell-1.1.0-dev";
// Substituído pelo build com todos os arquivos e um identificador de conteúdo.
const SHELL = ["/", "/offline.html", "/manifest.webmanifest"];

function cleanResponse(response) {
  if (!response) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function fetchAndCache(cache, path) {
  const response = await fetch(path, {
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Falha ao pré-carregar ${path}: ${response.status}`);
  }

  const normalized = cleanResponse(response);
  await cache.put(path, normalized.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Evita armazenar Responses com metadados de redirect.
    // O Safari/WebKit recusa Responses redirecionadas devolvidas pelo SW.
    for (const path of SHELL) {
      await fetchAndCache(cache, path);
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    // Remove caches de shell anteriores, inclusive os que possam conter
    // /index.html salvo como Response redirecionada.
    await Promise.all(
      keys
        .filter((key) => key.startsWith("praxis-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/sw.js"
  ) return;

  const isNavigation = request.mode === "navigate";
  const isShellAsset =
    SHELL.includes(url.pathname) ||
    url.pathname.startsWith("/assets/");

  if (!isNavigation && !isShellAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (isNavigation) {
      // App shell canônico: "/" em vez de "/index.html".
      // Isto evita o redirect comum /index.html -> / em hosts estáticos.
      const cachedShell = await cache.match("/");
      if (cachedShell) return cleanResponse(cachedShell);

      try {
        const network = await fetch(request);
        const normalized = cleanResponse(network);

        if (normalized.ok) {
          await cache.put("/", normalized.clone());
        }

        return normalized;
      } catch {
        const offline = await cache.match("/offline.html");
        if (offline) return cleanResponse(offline);
        throw new Error("Práxis indisponível e sem shell offline.");
      }
    }

    const cached = await cache.match(url.pathname);
    if (cached) return cleanResponse(cached);

    const response = await fetch(request);
    const normalized = cleanResponse(response);

    if (normalized.ok) {
      await cache.put(url.pathname, normalized.clone());
    }

    return normalized;
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

  const requested = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );

  const targetUrl =
    requested.origin === self.location.origin
      ? requested.href
      : self.location.origin + "/";

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of windows) {
      if ("navigate" in client) {
        try { await client.navigate(targetUrl); }
        catch { /* tenta abrir uma nova janela abaixo */ }
      }

      if ("focus" in client) {
        await client.focus();
        return;
      }
    }

    await self.clients.openWindow(targetUrl);
  })());
});
