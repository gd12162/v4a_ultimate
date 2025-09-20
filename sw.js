/* sw.js - v7.0.0-2025-09-20 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const SW_VERSION = "v7.0.0-2025-09-20";
const CACHE_NAME = "app-cache-" + SW_VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

function isNavigationalRequest(req) {
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navigation: Network first, fallback to cache, then offline page
  if (isNavigationalRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // Optionally: update cache with fresh page
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || caches.match("./offline.html");
      }
    })());
    return;
  }

  // Static assets: Cache first, then network, and update cache in background
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      // Revalidate in background (non-blocking)
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, fresh.clone());
        } catch (_) {}
      })());
      return cached;
    }
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return new Response("네트워크 오류", { status: 408, statusText: "Network Error" });
    }
  })());
});
