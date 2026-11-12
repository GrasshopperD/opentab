// OpenTab service worker: offline app shell for the family signing screen.
// Never caches /api responses (balances and payments must come from the chain).
const CACHE = "opentab-v2";
const SHELL = ["/", "/family", "/shop", "/sender", "/demo", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "precache" && Array.isArray(e.data.urls)) {
    const urls = e.data.urls.filter((u) => { try { const x = new URL(u); return x.origin === location.origin && !x.pathname.startsWith("/api/"); } catch { return false; } });
    e.waitUntil(caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => {})))));
  }
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || /\.(svg|png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; })));
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, cp)); return r; })
      .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/family"))));
  }
});
