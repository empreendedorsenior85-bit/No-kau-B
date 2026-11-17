/*
 * Service Worker do Nô Kau — menu e pedidos sem internet.
 *
 *  - Menu da mesa (/m/…), menu público (/menu) e estado do pedido: rede primeiro; sem rede, a última versão guardada.
 *  - Scripts e estilos do site (/_next/static, com nome único por versão): guardados e servidos daqui.
 *  - Fotografias: servidas daqui e atualizadas em segundo plano.
 *  - Painel (/admin) e APIs internas: nunca guardados.
 *  - Pedidos feitos sem rede ficam no telemóvel (IndexedDB "nokau", loja "outbox") e são enviados assim que
 *    houver ligação — pela página, pela sincronização em segundo plano (Background Sync) ou aqui.
 *    Cada pedido tem uma chave única: reenviar nunca cria um pedido repetido.
 */
const VERSION = "nokau-v3";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const IMG = `${VERSION}-img`;
const OFFLINE_URL = "/offline.html";
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isPage = (url) => url.pathname === "/menu" || /^\/m\/[^/]+(\/pedido\/[^/]+)?\/?$/.test(url.pathname);
const isImage = (url, req) =>
  req.destination === "image" || /^\/(menu\/ilustrativas|api\/menu-image|brand|icons|photos)\//.test(url.pathname) || url.pathname === "/_next/image";
const isOrderStatus = (url) => /^\/api\/pedidos\/[0-9a-f-]{36}$/i.test(url.pathname);

function classify(url, req) {
  if (url.origin !== self.location.origin) return null;
  if (/^\/(admin|api\/admin|api\/sync)(\/|$)/.test(url.pathname)) return null;
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return null;
  // fontes: o navegador já as pré-carrega e guarda (nome com hash, cache longa); intercetá-las fazia-as descarregar duas vezes
  if (req.destination === "font" || /\.(woff2?|ttf|otf)$/.test(url.pathname)) return null;
  if (url.pathname.startsWith("/_next/static/")) return "static";
  if (isImage(url, req)) return "image";
  if ((req.mode === "navigate" || req.destination === "document" || req.headers.get("accept")?.includes("text/html")) && isPage(url)) return "page";
  if (isOrderStatus(url)) return "status";
  return null;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const kind = classify(url, req);
  if (!kind) return;
  if (kind === "static") event.respondWith(cacheFirst(req, STATIC));
  else if (kind === "image") event.respondWith(staleWhileRevalidate(req, IMG));
  else if (kind === "page") event.respondWith(networkFirst(req, PAGES, true));
  else if (kind === "status") event.respondWith(networkFirst(req, PAGES, false));
});

const cacheable = (res) => res && res.ok && res.type === "basic" && !res.redirected;

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  const net = fetch(req).then((res) => { if (cacheable(res)) cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) return hit;
  return (await net) || new Response("", { status: 504 });
}

/** Rede primeiro (com tempo limite); a resposta da rede atualiza a cópia guardada mesmo se chegar tarde. */
async function networkFirst(req, name, isNavigation) {
  const cache = await caches.open(name);
  const key = new Request(req.url, { credentials: "same-origin" });
  const net = fetch(req).then((res) => {
    if (cacheable(res)) cache.put(key, res.clone());
    return res;
  });
  net.catch(() => {}); // sem rede: tratado abaixo (evita "rejeição não tratada")
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), NETWORK_TIMEOUT_MS))]);
  } catch {
    const hit = await cache.match(key, { ignoreVary: true });
    if (hit) return hit;
    try { return await net; } catch {}
    if (isNavigation) return (await cache.match(OFFLINE_URL)) || new Response("Sem ligação", { status: 503 });
    return new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } });
  }
}

/* Mensagens da página:
 *  precache — guarda já o HTML, os scripts e as fotos da página aberta (a primeira visita é feita antes de o SW controlar a página);
 *  flush    — tenta enviar os pedidos em fila. */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "precache" && Array.isArray(data.urls)) {
    event.waitUntil(precache(data.urls).then((n) => event.source && event.source.postMessage({ type: "precached", count: n })));
  } else if (data.type === "flush") {
    event.waitUntil(flushOutbox());
  }
});

async function precache(urls) {
  let n = 0;
  for (const raw of urls.slice(0, 400)) {
    try {
      const url = new URL(raw, self.location.origin);
      if (url.origin !== self.location.origin) continue;
      const req = new Request(url.href, { credentials: "same-origin" });
      if (/\.(woff2?|ttf|otf)$/.test(url.pathname)) continue;
      const kind = url.pathname.startsWith("/_next/static/") ? STATIC : isPage(url) ? PAGES : isImage(url, req) ? IMG : null;
      if (!kind) continue;
      const cache = await caches.open(kind);
      if (kind === STATIC && (await cache.match(req))) { n++; continue; }
      const res = await fetch(req, kind === PAGES ? { headers: { accept: "text/html" } } : undefined);
      if (cacheable(res)) { await cache.put(req, res); n++; }
    } catch {}
  }
  return n;
}

/* ---------- fila de pedidos (IndexedDB) — o mesmo formato de src/lib/outbox.ts ---------- */
self.addEventListener("sync", (event) => {
  if (event.tag === "nokau-outbox") event.waitUntil(flushOutbox());
});

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("nokau", 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("outbox")) r.result.createObjectStore("outbox", { keyPath: "key" }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function idbAll(db) {
  return new Promise((resolve, reject) => {
    const r = db.transaction("outbox", "readonly").objectStore("outbox").getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}
function idbPut(db, rec) {
  return new Promise((resolve, reject) => {
    const t = db.transaction("outbox", "readwrite");
    t.objectStore("outbox").put(rec);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

let flushing = null;
function flushOutbox() {
  flushing = flushing || (async () => {
    let changed = false;
    try {
      const db = await idb();
      const queued = (await idbAll(db)).filter((r) => r.state === "queued");
      for (const rec of queued) {
        let res, data;
        try {
          res = await fetch("/api/pedidos", {
            method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
            body: JSON.stringify({ token: rec.token, key: rec.key, lines: rec.lines.map((l) => ({ itemId: l.itemId, quantity: l.qty, note: l.note || undefined })) }),
          });
          data = await res.json().catch(() => null);
        } catch { break; } // sem rede: os restantes também falhariam
        const now = Date.now();
        if (res.ok && data && data.ok) {
          await idbPut(db, { ...rec, state: "sent", orderId: data.orderId, number: data.number, origin: data.origin || "central", sentAt: now, attempts: (rec.attempts || 0) + 1, lastAttemptAt: now });
          changed = true;
        } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 && !(data && data.retry)) {
          await idbPut(db, { ...rec, state: "rejected", message: (data && data.message) || "O restaurante não aceitou este pedido.", itemIds: data && data.itemIds, attempts: (rec.attempts || 0) + 1, lastAttemptAt: now });
          changed = true;
        } else {
          await idbPut(db, { ...rec, attempts: (rec.attempts || 0) + 1, lastAttemptAt: now });
        }
      }
    } finally {
      flushing = null;
      if (changed) for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage({ type: "outbox-updated" });
    }
  })();
  return flushing;
}
