import "server-only";
import { query } from "@/lib/db";
import { initDatabase } from "@/db/init";
import { centralUrl, isLocalServer, syncToken } from "@/lib/node-role";
import { applyCatalog, saveFetchedImage, type WireCatalog } from "./catalog-sync";
import { applyOrders, getSyncState, pendingPush, setSyncState, type WireOrder } from "./orders-sync";

/**
 * Sincronização do SERVIDOR LOCAL do restaurante com o servidor central. Corre em ciclo, sozinha:
 *  1. catálogo (menu, mesas, utilizadores) do central → local, a cada minuto;
 *  2. pedidos criados/alterados aqui → central (idempotente: repetir nunca duplica);
 *  3. pedidos criados/alterados no central → aqui.
 * Sem internet o restaurante continua a trabalhar no servidor local; quando a ligação volta,
 * o ciclo seguinte (≤ 5 s) envia tudo o que ficou pendente.
 */

export type LocalSyncStatus = {
  role: "local";
  central: string;
  online: boolean;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastCatalogAt: string | null;
  pending: number;
  rejected: { id: string; reason: string; at: string }[];
};

const g = globalThis as unknown as { __nokauSync?: { started: boolean; status: LocalSyncStatus } };
const INTERVAL_MS = Number(process.env.NOKAU_SYNC_INTERVAL_MS ?? 5000);
const CATALOG_EVERY_MS = 60_000;
const TIMEOUT_MS = 10_000;

function state(): LocalSyncStatus {
  if (!g.__nokauSync) {
    g.__nokauSync = {
      started: false,
      status: { role: "local", central: centralUrl(), online: false, lastOkAt: null, lastErrorAt: null, lastError: null, lastCatalogAt: null, pending: 0, rejected: [] },
    };
  }
  return g.__nokauSync.status;
}

async function central<T>(path: string, init?: RequestInit & { pending?: number }): Promise<T> {
  const res = await fetch(`${centralUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${syncToken()}`,
      "content-type": "application/json",
      "x-nokau-pending": String(init?.pending ?? state().pending),
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`central respondeu ${res.status} em ${path}`);
  return res.json() as Promise<T>;
}

async function syncCatalog() {
  const cat = await central<WireCatalog>("/api/sync/catalog");
  const { imagesToFetch } = await applyCatalog(cat);
  for (const img of imagesToFetch) {
    const res = await fetch(`${centralUrl()}/api/sync/image/${img.id}`, {
      headers: { authorization: `Bearer ${syncToken()}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store",
    });
    if (!res.ok) continue;
    await saveFetchedImage(img.id, Number(res.headers.get("x-image-version") ?? img.version), res.headers.get("content-type") ?? "image/jpeg",
      Buffer.from(await res.arrayBuffer()));
  }
  state().lastCatalogAt = new Date().toISOString();
}

async function pushOrders() {
  for (let round = 0; round < 20; round++) {
    const batch = await pendingPush(100);
    if (!batch.length) return;
    const r = await central<{ applied: string[]; rejected: { id: string; reason: string }[] }>("/api/sync/orders", {
      method: "POST", body: JSON.stringify({ orders: batch.map((b) => b.order) }),
    });
    const revById = new Map(batch.map((b) => [b.order.id, b.rev]));
    // só limpa se o pedido não mudou desde que foi lido (senão a alteração nova segue no ciclo seguinte)
    for (const id of r.applied) {
      await query("update orders set needs_push = false, synced_at = now() where id = $1 and rev = $2", [id, revById.get(id)]);
    }
    for (const x of r.rejected) {
      // recusa definitiva (dados incompatíveis): regista e deixa de insistir, para não bloquear os outros
      await query("update orders set needs_push = false where id = $1 and rev = $2", [x.id, revById.get(x.id)]);
      await query(`insert into audit_log (actor, action, entity, entity_id, detail) values ('sincronização','sync.rejected','order',$1,$2)`,
        [x.id, JSON.stringify({ reason: x.reason })]);
      state().rejected = [{ ...x, at: new Date().toISOString() }, ...state().rejected].slice(0, 20);
    }
    if (batch.length < 100) return;
  }
}

async function pullOrders() {
  let cursor = (await getSyncState<{ cursor: number }>("local:pull"))?.cursor ?? 0;
  for (let round = 0; round < 50; round++) {
    const r = await central<{ orders: WireOrder[]; cursor: number; more: boolean }>(`/api/sync/orders?after=${cursor}`);
    if (r.orders.length) await applyOrders(r.orders, "servidor-central");
    cursor = r.cursor;
    await setSyncState("local:pull", { cursor });
    if (!r.more) return;
  }
}

let ready: Promise<void> | null = null;
let lastCatalog = 0;

/** Um ciclo completo. Exportado para os testes e para "sincronizar agora" no painel. */
export async function syncOnce(): Promise<LocalSyncStatus> {
  const s = state();
  try {
    ready ??= initDatabase().catch((e) => { ready = null; throw e; });
    await ready;
    if (!centralUrl() || !syncToken()) throw new Error("NOKAU_CENTRAL_URL ou NOKAU_SYNC_TOKEN (mín. 32 caracteres) em falta");
    if (Date.now() - lastCatalog > CATALOG_EVERY_MS) { await syncCatalog(); lastCatalog = Date.now(); }
    await pushOrders();
    await pullOrders();
    s.online = true;
    s.lastOkAt = new Date().toISOString();
    s.lastError = null;
  } catch (e) {
    s.online = false;
    s.lastErrorAt = new Date().toISOString();
    s.lastError = describe(e);
  }
  try {
    const n = await query<{ n: string }>("select count(*) n from orders where needs_push");
    s.pending = Number(n.rows[0].n);
  } catch {}
  return s;
}

function describe(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string } };
  if (err.name === "TimeoutError") return "O servidor central não respondeu (sem internet?)";
  if (err.cause?.code === "ENOTFOUND" || err.cause?.code === "EAI_AGAIN") return "Sem internet (endereço do central não encontrado)";
  if (err.cause?.code === "ECONNREFUSED" || err.cause?.code === "ECONNRESET") return "Sem ligação ao servidor central";
  return err.message ?? String(e);
}

export function localSyncStatus(): LocalSyncStatus {
  return state();
}

/** Arranque (instrumentation.ts). Uma só vez por processo. */
export function startSyncWorker() {
  if (!isLocalServer()) return;
  state();
  if (g.__nokauSync!.started) return;
  g.__nokauSync!.started = true;
  console.log(`[sync] servidor local — central: ${centralUrl() || "(não configurado)"}; ciclo de ${INTERVAL_MS} ms`);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const before = state().online;
      const s = await syncOnce();
      if (before !== s.online) console.log(s.online ? "[sync] ligado ao servidor central" : `[sync] sem ligação ao central: ${s.lastError}`);
    } finally {
      running = false;
      setTimeout(tick, INTERVAL_MS);
    }
  };
  setTimeout(tick, 500);
}
