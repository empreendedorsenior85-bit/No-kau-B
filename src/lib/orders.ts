import "server-only";
import type { PoolClient } from "pg";
import { query, tx } from "./db";
import type { Order, OrderStatus } from "./types";
import { NEXT_STATUS, PREV_STATUS } from "./types";
import { isLocalServer } from "./node-role";
import { ensureMigrated } from "@/db/init";

type Row = {
  id: string; number: number; origin: "central" | "local"; table_id: number; table_label: string; status: OrderStatus; total: number;
  is_test: boolean; paid: boolean; created_at: Date; updated_at: Date; rev: string; items: Order["items"];
};

const SELECT = `
  select o.id, o.number, o.origin, o.table_id, t.label as table_label, o.status, o.total, o.is_test, (o.payment_id is not null) as paid,
         o.created_at, o.updated_at, o.rev,
         coalesce((select json_agg(json_build_object('name', i.name, 'quantity', i.quantity,
                   'unitPrice', i.unit_price, 'note', i.note) order by i.id)
                   from order_items i where i.order_id = o.id), '[]'::json) as items
  from orders o join dining_tables t on t.id = o.table_id`;

const toOrder = (r: Row): Order => ({
  id: r.id, number: r.number, origin: r.origin, tableId: r.table_id, tableLabel: r.table_label, status: r.status, total: r.total,
  isTest: r.is_test, paid: r.paid, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  rev: Number(r.rev), items: r.items,
});

export type OrderLineInput = { itemId: number; quantity: number; note?: string };

export type PlaceResult =
  | { ok: true; order: Order; duplicate: boolean }
  | { ok: false; code: "invalid_table" | "unavailable" | "rate_limited" | "key_conflict" | "empty"; message: string; itemIds?: number[] };

const orderById = async (c: Pick<PoolClient, "query">, id: string) => {
  const r = await c.query<Row>(`${SELECT} where o.id = $1`, [id]);
  return r.rows[0] ? toOrder(r.rows[0]) : null;
};
const orderByIdPool = (id: string) => orderById({ query: (t: string, p?: unknown[]) => query(t, p) } as Pick<PoolClient, "query">, id);

/**
 * Cria um pedido. Tudo o que importa é decidido aqui, no servidor:
 * mesa (pelo token), preços, disponibilidade, total e duplicados.
 */
export async function placeOrder(token: string, lines: OrderLineInput[], idemKey: string, customerId: string | null = null): Promise<PlaceResult> {
  await ensureMigrated(); // colunas novas (origem, sincronização) existem antes do primeiro pedido após uma atualização
  try {
    return await tx(async (c): Promise<PlaceResult> => {
      const t = await c.query<{ id: number }>("select id from dining_tables where qr_token = $1 and active", [token]);
      if (!t.rows[0]) return { ok: false, code: "invalid_table", message: "Este QR Code já não é válido. Peça ajuda a um empregado." };
      const tableId = t.rows[0].id;

      // pedido repetido (duplo toque / reenvio por rede lenta): devolve o mesmo
      const prev = await c.query<{ id: string; table_id: number }>("select id, table_id from orders where idempotency_key = $1", [idemKey]);
      if (prev.rows[0]) {
        if (prev.rows[0].table_id !== tableId) return { ok: false, code: "key_conflict", message: "Pedido inválido. Atualize a página e tente novamente." };
        return { ok: true, order: (await orderById(c, prev.rows[0].id))!, duplicate: true };
      }

      // limite por mesa: protege contra abuso de um QR Code
      const recent = await c.query<{ n: string }>(
        "select count(*) n from orders where table_id = $1 and created_at > now() - interval '10 minutes'", [tableId]);
      if (Number(recent.rows[0].n) >= 20) return { ok: false, code: "rate_limited", message: "Demasiados pedidos desta mesa em pouco tempo. Chame um empregado." };

      // juntar linhas repetidas do mesmo produto e validar contra o menu real
      const wanted = new Map<number, { quantity: number; note?: string }>();
      for (const l of lines) {
        const cur = wanted.get(l.itemId);
        if (cur) cur.quantity += l.quantity;
        else wanted.set(l.itemId, { quantity: l.quantity, note: l.note });
      }
      if (wanted.size === 0) return { ok: false, code: "empty", message: "O pedido está vazio." };

      const ids = [...wanted.keys()];
      const menu = await c.query<{ id: number; name: string; price: number; is_demo: boolean }>(
        `select i.id, i.name, i.price, i.is_demo from menu_items i
         join menu_categories c on c.id = i.category_id
         where i.id = any($1) and i.active and i.available and c.active`, [ids]);
      const byId = new Map(menu.rows.map((m) => [m.id, m]));
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length) return { ok: false, code: "unavailable", message: "Alguns produtos já não estão disponíveis.", itemIds: missing };

      let total = 0;
      for (const [id, w] of wanted) {
        const q = Math.min(20, w.quantity);
        wanted.get(id)!.quantity = q;
        total += byId.get(id)!.price * q;
      }
      const isTest = menu.rows.some((m) => m.is_demo);

      // no servidor local: numeração própria (L0001…) e marcado para enviar ao central quando houver internet
      const local = isLocalServer();
      const ins = await c.query<{ id: string }>(
        `insert into orders (table_id, total, is_test, idempotency_key, origin, number, needs_push, customer_id)
         values ($1,$2,$3,$4,$5, nextval(case when $5 = 'local' then 'orders_local_number_seq' else 'orders_number_seq' end), $6, $7)
         returning id`,
        [tableId, total, isTest, idemKey, local ? "local" : "central", local, customerId]); // também no servidor local (as contas são sincronizadas)
      const orderId = ins.rows[0].id;
      for (const [id, w] of wanted) {
        const m = byId.get(id)!;
        await c.query(
          `insert into order_items (order_id, menu_item_id, name, unit_price, quantity, note) values ($1,$2,$3,$4,$5,$6)`,
          [orderId, id, m.name, m.price, w.quantity, w.note?.trim() || null]);
      }
      await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ('cliente','order.create','order',$1,$2)`,
        [orderId, JSON.stringify({ tableId, total, isTest })]);
      return { ok: true, order: (await orderById(c, orderId))!, duplicate: false };
    });
  } catch (e) {
    // corrida entre dois envios com a mesma chave: o segundo apanha o pedido do primeiro
    if ((e as { code?: string }).code === "23505") {
      const r = await query<{ id: string }>("select id from orders where idempotency_key = $1", [idemKey]);
      if (r.rows[0]) {
        const o = await orderByIdPool(r.rows[0].id);
        if (o) return { ok: true, order: o, duplicate: true };
      }
    }
    throw e;
  }
}

/** Estado público de um pedido (confirmação do cliente). Exige o token da mesa correspondente. */
export async function getOrderForTable(orderId: string, token: string): Promise<Order | null> {
  await ensureMigrated();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const r = await query<Row>(`${SELECT} where o.id = $1 and t.qr_token = $2`, [orderId, token]);
  return r.rows[0] ? toOrder(r.rows[0]) : null;
}

/** Instantâneo para o painel: pedidos ativos + concluídos nas últimas 24 h. */
export async function snapshot(): Promise<{ orders: Order[]; rev: number }> {
  await ensureMigrated();
  // ler o rev ANTES dos pedidos: qualquer pedido posterior chega pelo stream
  // rev partilhado por pedidos e chamadas (mesma sequência): um só cursor para o tempo real
  const rev = await query<{ r: string }>("select greatest((select coalesce(max(rev),0) from orders), (select coalesce(max(rev),0) from service_calls), (select coalesce(max(rev),0) from reservations)) r");
  const r = await query<Row>(
    `${SELECT} where o.status <> 'done' or o.updated_at > now() - interval '24 hours' order by o.created_at desc`);
  return { orders: r.rows.map(toOrder), rev: Number(rev.rows[0].r) };
}

export async function tableHistory(tableId: number, before: string | null, limit = 20): Promise<Order[]> {
  const r = await query<Row>(
    `${SELECT} where o.table_id = $1 and ($2::timestamptz is null or o.created_at < $2) order by o.created_at desc limit $3`,
    [tableId, before, Math.min(limit, 50)]);
  return r.rows.map(toOrder);
}

/**
 * Alterações desde `cursor`. Duas consultas, por ordem de prioridade:
 *  1. o que é novo (rev > cursor) — nunca fica de fora;
 *  2. a janela de 20 s ABAIXO do cursor, para transações que confirmaram fora de ordem.
 * (Antes era uma só consulta com limite 200: depois de uma sincronização grande — centenas de pedidos
 * com updated_at recente — os pedidos novos ficavam fora do limite e só apareciam 20 s depois.)
 */
export async function changedSince(cursor: number): Promise<Order[]> {
  await ensureMigrated();
  const fresh = await query<Row>(`${SELECT} where o.rev > $1 order by o.rev asc limit 200`, [cursor]);
  const late = await query<Row>(
    `${SELECT} where o.rev <= $1 and o.updated_at > now() - interval '20 seconds' order by o.rev desc limit 100`, [cursor]);
  return [...fresh.rows, ...late.rows].map(toOrder);
}

export async function currentRev(): Promise<number> {
  await ensureMigrated();
  const r = await query<{ r: string }>("select greatest((select coalesce(max(rev),0) from orders), (select coalesce(max(rev),0) from service_calls), (select coalesce(max(rev),0) from reservations)) r");
  return Number(r.rows[0].r);
}

export type StatusResult = { ok: true; order: Order } | { ok: false; message: string };

/** Só avança/recua um passo e só se o estado ainda for o que o gerente estava a ver. */
export async function changeStatus(orderId: string, from: OrderStatus, to: OrderStatus, actor: string): Promise<StatusResult> {
  await ensureMigrated();
  if (NEXT_STATUS[from] !== to && PREV_STATUS[from] !== to) return { ok: false, message: "Transição de estado inválida." };
  return tx(async (c): Promise<StatusResult> => {
    const u = await c.query(
      "update orders set status = $3, status_changed_at = now(), needs_push = $4 where id = $1 and status = $2 returning id",
      [orderId, from, to, isLocalServer()]);
    if (!u.rows[0]) {
      const cur = await orderById(c, orderId);
      return cur ? { ok: true, order: cur } : { ok: false, message: "Pedido não encontrado." };
    }
    await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'order.status','order',$2,$3)`,
      [actor, orderId, JSON.stringify({ from, to })]);
    return { ok: true, order: (await orderById(c, orderId))! };
  });
}
