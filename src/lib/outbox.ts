"use client";

/**
 * Fila de pedidos no telemóvel (IndexedDB "nokau", loja "outbox"). O MESMO formato é usado por public/sw.js.
 *
 * Todo o pedido é guardado aqui ANTES de ser enviado: fechar a página, ficar sem rede ou sem bateria
 * a meio do envio não o perde. É enviado assim que houver ligação (página aberta, Background Sync ou
 * ao voltar a abrir o menu). A chave (`key`) é a chave de idempotência do servidor: reenviar nunca duplica.
 */
export type OutboxLine = { itemId: number; name: string; price: number; qty: number; note: string };
export type OutboxRecord = {
  key: string;
  token: string;
  tableLabel: string;
  lines: OutboxLine[];
  /** Total estimado no telemóvel; o restaurante recalcula com os preços atuais. */
  estTotal: number;
  createdAt: number;
  state: "queued" | "sent" | "rejected";
  attempts: number;
  lastAttemptAt?: number;
  sentAt?: number;
  orderId?: string;
  number?: number;
  origin?: "central" | "local";
  message?: string;
  itemIds?: number[];
  /** O restaurante pediu para entrar na conta (sessão terminada): continua guardado e segue depois do login. */
  needsLogin?: boolean;
};

const DB = "nokau";
const STORE = "outbox";
const KEEP_MS = 12 * 3600_000; // pedidos enviados/recusados ficam visíveis 12 h (histórico no telemóvel)

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponível"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "key" }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("IndexedDB bloqueado"));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const outboxAvailable = async () => { try { await db(); return true; } catch { return false; } };
export const putRecord = (r: OutboxRecord) => run("readwrite", (s) => { s.put(r); });
export const deleteRecord = (key: string) => run("readwrite", (s) => { s.delete(key); });
export async function allRecords(): Promise<OutboxRecord[]> {
  return ((await run<OutboxRecord[]>("readonly", (s) => s.getAll())) ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

/** Pedidos desta mesa; limpa os antigos já resolvidos. */
export async function recordsFor(token: string): Promise<OutboxRecord[]> {
  const all = await allRecords();
  const now = Date.now();
  for (const r of all) if (r.state !== "queued" && now - (r.sentAt ?? r.lastAttemptAt ?? r.createdAt) > KEEP_MS) await deleteRecord(r.key);
  return all.filter((r) => r.token === token && (r.state === "queued" || now - (r.sentAt ?? r.lastAttemptAt ?? r.createdAt) <= KEEP_MS));
}

export type SendOnce =
  | { kind: "sent"; orderId: string; number: number; origin: "central" | "local" }
  | { kind: "rejected"; message: string; itemIds?: number[] }
  | { kind: "retry"; message?: string }
  | { kind: "login"; message: string };

/** Uma tentativa de envio (a repetição é feita pela fila). */
export async function sendOnce(r: Pick<OutboxRecord, "token" | "key" | "lines">, timeoutMs = 15_000): Promise<SendOnce> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/pedidos", {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", signal: ctl.signal,
      body: JSON.stringify({ token: r.token, key: r.key, lines: r.lines.map((l) => ({ itemId: l.itemId, quantity: l.qty, note: l.note.trim() || undefined })) }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; orderId?: string; number?: number; origin?: "central" | "local"; message?: string; itemIds?: number[]; retry?: boolean; loginRequired?: boolean } | null;
    if (res.ok && data?.ok && data.orderId) return { kind: "sent", orderId: data.orderId, number: data.number ?? 0, origin: data.origin ?? "central" };
    if (res.status === 401 && data?.loginRequired) return { kind: "login", message: data.message ?? "Entre na sua conta para enviar." };
    const definitive = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 && !data?.retry;
    if (definitive) return { kind: "rejected", message: data?.message ?? "O restaurante não aceitou este pedido.", itemIds: data?.itemIds };
    return { kind: "retry", message: data?.message };
  } catch {
    return { kind: "retry" };
  } finally {
    clearTimeout(timer);
  }
}

let flushing: Promise<boolean> | null = null;
/** Envia os pedidos em fila (todas as mesas). Devolve true se algum mudou de estado. */
export function flushOutbox(): Promise<boolean> {
  flushing ??= (async () => {
    let changed = false;
    try {
      for (const r of (await allRecords()).filter((x) => x.state === "queued").reverse()) {
        const s = await sendOnce(r);
        const now = Date.now();
        if (s.kind === "sent") { await putRecord({ ...r, state: "sent", orderId: s.orderId, number: s.number, origin: s.origin, sentAt: now, attempts: r.attempts + 1, lastAttemptAt: now }); changed = true; }
        else if (s.kind === "rejected") { await putRecord({ ...r, state: "rejected", message: s.message, itemIds: s.itemIds, attempts: r.attempts + 1, lastAttemptAt: now }); changed = true; }
        else if (s.kind === "login") { await putRecord({ ...r, needsLogin: true, attempts: r.attempts + 1, lastAttemptAt: now }); changed = true; break; } // fica guardado até o cliente entrar
        else { await putRecord({ ...r, attempts: r.attempts + 1, lastAttemptAt: now }); break; } // sem rede: não insistir com os restantes agora
      }
    } catch {}
    flushing = null;
    return changed;
  })();
  return flushing;
}

/** Pede ao Service Worker que tente enviar em segundo plano quando a rede voltar (Chrome/Android). */
export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } } | undefined)?.sync;
    await sync?.register("nokau-outbox");
  } catch {}
}
