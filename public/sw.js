// Service worker mínimo do Cold: só serve uma página "sem ligação" quando a internet falha.
// Não guarda em cache a app, a API nem as respostas do tutor (assim nunca fica uma versão antiga presa).
const CACHE = "cold-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // pedidos à API e ficheiros passam direto, sem tocar
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE_URL)));
});
