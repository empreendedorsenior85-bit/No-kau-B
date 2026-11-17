import "server-only";
import type { PoolClient } from "pg";
import { query, tx } from "@/lib/db";
import type { OrderStatus } from "@/lib/types";

/**
 * Formato de um pedido na sincronização entre o servidor local do restaurante e o servidor central.
 * Os ids (uuid) são gerados em quem cria o pedido e nunca mudam: identificam o pedido nos dois lados.
 */
export type WireOrder = {
  id: string;
  origin: "central" | "local";
  number: number;
  tableId: number;
  status: OrderStatus;
  statusChangedAt: string;
  total: number;
  isTest: boolean;
  idempotencyKey: string;
  createdAt: string;
  items: { menuItemId: number | null; name: string; unitPrice: number; quantity: number; note: string | null }[];
};

const STATUSES = new Set(["pending", "preparing", "done"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validação defensiva do que chega pela rede (mesmo vindo de um servidor autenticado). */
export function isWireOrder(o: unknown): o is WireOrder {
  const x = o as WireOrder;
  return !!x && typeof x === "object" && UUID.test(x.id) && (x.origin === "central" || x.origin === "local")
    && Number.isInteger(x.number) && x.number > 0 && Number.isInteger(x.tableId) && STATUSES.has(x.status)
    && !Number.isNaN(Date.parse(x.statusChangedAt)) && !Number.isNaN(Date.parse(x.createdAt))
    && Number.isInteger(x.total) && x.total >= 0 && typeof x.isTest === "boolean"
    && typeof x.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(x.idempotencyKey)
    && Array.isArray(x.items) && x.items.length > 0 && x.items.length <= 30
    && x.items.every((i) => i && typeof i.name === "string" && i.name.length <= 120 && Number.isInteger(i.unitPrice) && i.unitPrice >= 0
      && Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 20 && (i.note === null || (typeof i.note === "string" && i.note.length <= 200))
      && (i.menuItemId === null || Number.isInteger(i.menuItemId)));
}

const WIRE_SELECT = `
  select o.id, o.origin, o.number, o.table_id, o.status, o.status_changed_at, o.total, o.is_test, o.idempotency_key, o.created_at, o.rev,
         coalesce((select json_agg(json_build_object('menuItemId', i.menu_item_id, 'name', i.name, 'unitPrice', i.unit_price,
                   'quantity', i.quantity, 'note', i.note) order by i.id) from order_items i where i.order_id = o.id), '[]'::json) as items
  from orders o`;

type WireRow = {
  id: string; origin: "central" | "local"; number: number; table_id: number; status: OrderStatus; status_changed_at: Date;
  total: number; is_test: boolean; idempotency_key: string; created_at: Date; rev: string; items: WireOrder["items"];
};
const toWire = (r: WireRow): WireOrder => ({
  id: r.id, origin: r.origin, number: r.number, tableId: r.table_id, status: r.status, statusChangedAt: r.status_changed_at.toISOString(),
  total: r.total, isTest: r.is_test, idempotencyKey: r.idempotency_key, createdAt: r.created_at.toISOString(), items: r.items,
});

/** Pedidos alterados depois de `after` (rev), mais os dos últimos 2 min (transações que confirmam fora de ordem). */
export async function ordersChangedAfter(after: number, limit = 200): Promise<{ orders: WireOrder[]; cursor: number; more: boolean }> {
  const r = await query<WireRow>(`${WIRE_SELECT} where o.rev > $1 order by o.rev asc limit $2`, [after, limit + 1]);
  const more = r.rows.length > limit;
  const rows = r.rows.slice(0, limit);
  const recent = await query<WireRow>(`${WIRE_SELECT} where o.updated_at > now() - interval '2 minutes' order by o.rev asc limit 500`);
  const seen = new Set(rows.map((x) => x.id));
  const all = [...rows, ...recent.rows.filter((x) => !seen.has(x.id))];
  const cursor = rows.length ? Number(rows[rows.length - 1].rev) : after;
  return { orders: all.map(toWire), cursor, more };
}

/** Pedidos com alterações por enviar (servidor local). Devolve também o rev lido, para só limpar o que não mudou entretanto. */
export async function pendingPush(limit = 100): Promise<{ order: WireOrder; rev: string }[]> {
  const r = await query<WireRow>(`${WIRE_SELECT} where o.needs_push order by o.created_at asc limit $1`, [limit]);
  return r.rows.map((x) => ({ order: toWire(x), rev: x.rev }));
}

export type ApplyResult = { applied: string[]; rejected: { id: string; reason: string }[] };

/**
 * Aplica pedidos vindos do outro servidor. Idempotente: repetir o mesmo lote não cria nada de novo.
 *  - pedido novo → criado com o MESMO id, origem e número;
 *  - pedido existente → o estado mais recente (status_changed_at) vence; o mais antigo é ignorado.
 * Cada pedido numa transação própria: um pedido com problema não bloqueia os outros.
 */
export async function applyOrders(orders: WireOrder[], actor: string): Promise<ApplyResult> {
  const out: ApplyResult = { applied: [], rejected: [] };
  for (const o of orders) {
    try {
      const reason = await tx((c) => applyOne(c, o, actor));
      if (reason) out.rejected.push({ id: o.id, reason });
      else out.applied.push(o.id);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      out.rejected.push({ id: o.id, reason: `erro ${err.code ?? ""} ${err.message ?? ""}`.trim() });
    }
  }
  return out;
}

async function applyOne(c: PoolClient, o: WireOrder, actor: string): Promise<string | null> {
  const ex = await c.query<{ status: OrderStatus; status_changed_at: Date }>(
    "select status, status_changed_at from orders where id = $1 for update", [o.id]);
  if (ex.rows[0]) {
    // vence a alteração mais recente; empate ou mais antiga → nada a fazer (repetição segura)
    if (new Date(o.statusChangedAt) > ex.rows[0].status_changed_at && o.status !== ex.rows[0].status) {
      await c.query("update orders set status = $2, status_changed_at = $3, needs_push = false, synced_at = now() where id = $1",
        [o.id, o.status, o.statusChangedAt]);
      await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync.status','order',$2,$3)`,
        [actor, o.id, JSON.stringify({ from: ex.rows[0].status, to: o.status })]);
    } else if (new Date(o.statusChangedAt) > ex.rows[0].status_changed_at) {
      await c.query("update orders set status_changed_at = $2 where id = $1", [o.id, o.statusChangedAt]);
    }
    return null;
  }
  const key = await c.query<{ id: string }>("select id from orders where idempotency_key = $1", [o.idempotencyKey]);
  if (key.rows[0]) return "a chave do pedido já pertence a outro pedido";
  const num = await c.query<{ id: string }>("select id from orders where origin = $1 and number = $2", [o.origin, o.number]);
  if (num.rows[0]) return `o número ${o.origin === "local" ? "L" : "#"}${o.number} já pertence a outro pedido`;
  const t = await c.query("select 1 from dining_tables where id = $1", [o.tableId]);
  if (!t.rows[0]) return `mesa ${o.tableId} desconhecida`;

  await c.query(
    `insert into orders (id, origin, number, table_id, status, status_changed_at, total, is_test, idempotency_key, created_at, needs_push, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,now())`,
    [o.id, o.origin, o.number, o.tableId, o.status, o.statusChangedAt, o.total, o.isTest, o.idempotencyKey, o.createdAt]);
  for (const i of o.items) {
    await c.query(
      `insert into order_items (order_id, menu_item_id, name, unit_price, quantity, note)
       values ($1,(select id from menu_items where id = $2),$3,$4,$5,$6)`,
      [o.id, i.menuItemId, i.name, i.unitPrice, i.quantity, i.note]);
  }
  await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync.order','order',$2,$3)`,
    [actor, o.id, JSON.stringify({ origin: o.origin, number: o.number, total: o.total })]);
  return null;
}

export async function getSyncState<T>(key: string): Promise<T | null> {
  const r = await query<{ value: T }>("select value from sync_state where key = $1", [key]);
  return r.rows[0]?.value ?? null;
}

export async function setSyncState(key: string, value: unknown) {
  await query(
    `insert into sync_state (key, value, updated_at) values ($1,$2,now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);
}
