import "server-only";
import type { PoolClient } from "pg";
import { query, tx } from "@/lib/db";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";

/**
 * Pagamentos na sincronização servidor local ↔ central.
 *  - o mesmo id nos dois lados; um pagamento nunca muda de valor/método — só pode passar a "anulado" (nunca o contrário);
 *  - os pedidos pagos seguem com o pagamento (orderIds);
 *  - CONFLITO: o mesmo pedido pago duas vezes (no local e no central, sem internet) → o segundo é recusado e fica
 *    registado na Atividade para o gerente decidir (devolver o dinheiro / anular um deles).
 *  - "adiado": um pedido do pagamento ainda não chegou a este lado → tenta-se de novo no ciclo seguinte.
 */
export type WirePayment = {
  id: string; origin: "central" | "local"; tableId: number; amount: number; method: PaymentMethod; tendered: number | null; receivedBy: string;
  note: string | null; status: "confirmed" | "voided"; voidedAt: string | null; voidedBy: string | null; voidReason: string | null;
  idempotencyKey: string; createdAt: string; statusChangedAt: string; orderIds: string[];
  /** Número do recibo, atribuído pelo servidor onde o pagamento foi registado (opcional: versões antigas não o enviam). */
  receiptNumber?: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const okDate = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

export function isWirePayment(o: unknown): o is WirePayment {
  const x = o as WirePayment;
  return !!x && typeof x === "object" && UUID.test(x.id) && (x.origin === "central" || x.origin === "local") && Number.isInteger(x.tableId)
    && Number.isInteger(x.amount) && x.amount > 0 && PAYMENT_METHODS.includes(x.method)
    && (x.tendered === null || (Number.isInteger(x.tendered) && x.tendered >= x.amount))
    && typeof x.receivedBy === "string" && x.receivedBy.length >= 1 && x.receivedBy.length <= 160
    && (x.note === null || (typeof x.note === "string" && x.note.length <= 200))
    && (x.status === "confirmed" || (x.status === "voided" && okDate(x.voidedAt) && typeof x.voidedBy === "string" && typeof x.voidReason === "string" && x.voidReason.length >= 3))
    && typeof x.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(x.idempotencyKey) && okDate(x.createdAt) && okDate(x.statusChangedAt)
    && (x.receiptNumber == null || (Number.isInteger(x.receiptNumber) && x.receiptNumber > 0))
    && Array.isArray(x.orderIds) && x.orderIds.length >= 1 && x.orderIds.length <= 100 && x.orderIds.every((i) => typeof i === "string" && UUID.test(i));
}

type Row = {
  id: string; origin: "central" | "local"; table_id: number; amount: number; method: PaymentMethod; tendered: number | null; received_by: string; note: string | null;
  status: "confirmed" | "voided"; voided_at: Date | null; voided_by: string | null; void_reason: string | null; idempotency_key: string;
  created_at: Date; status_changed_at: Date; rev: string; receipt_number: number | null; order_ids: string[] | null; void_orders: string[] | null;
};
// pedidos ligados; num pagamento anulado a ligação foi desfeita — guardam-se os ids na auditoria (void_orders)
const SELECT = `
  select p.id, p.origin, p.table_id, p.amount, p.method, p.tendered, p.received_by, p.note, p.status, p.voided_at, p.voided_by, p.void_reason,
         p.idempotency_key, p.created_at, p.status_changed_at, p.rev, p.receipt_number,
         (select array_agg(o.id) from orders o where o.payment_id = p.id) order_ids,
         (select array_agg(distinct x::uuid) from audit_log a, jsonb_array_elements_text(a.detail->'orderIds') x
           where a.entity = 'payment' and a.entity_id = p.id::text and a.action in ('payment.confirm','sync.payment')) void_orders
  from payments p`;
const toWire = (r: Row): WirePayment => ({
  id: r.id, origin: r.origin, tableId: r.table_id, amount: r.amount, method: r.method, tendered: r.tendered, receivedBy: r.received_by, note: r.note,
  status: r.status, voidedAt: r.voided_at?.toISOString() ?? null, voidedBy: r.voided_by, voidReason: r.void_reason, idempotencyKey: r.idempotency_key,
  createdAt: r.created_at.toISOString(), statusChangedAt: r.status_changed_at.toISOString(),
  orderIds: (r.order_ids?.length ? r.order_ids : r.void_orders) ?? [],
  receiptNumber: r.receipt_number,
});

export async function paymentsChangedAfter(after: number, limit = 200) {
  const r = await query<Row>(`${SELECT} where p.rev > $1 order by p.rev asc limit $2`, [after, limit + 1]);
  const more = r.rows.length > limit;
  const rows = r.rows.slice(0, limit);
  const recent = await query<Row>(`${SELECT} where p.updated_at > now() - interval '2 minutes' order by p.rev asc limit 300`);
  const seen = new Set(rows.map((x) => x.id));
  return { payments: [...rows, ...recent.rows.filter((x) => !seen.has(x.id))].map(toWire).filter((p) => p.orderIds.length > 0), cursor: rows.length ? Number(rows[rows.length - 1].rev) : after, more };
}

export async function pendingPaymentsPush(limit = 100) {
  const r = await query<Row>(`${SELECT} where p.needs_push order by p.created_at asc limit $1`, [limit]);
  return r.rows.map((x) => ({ payment: toWire(x), rev: x.rev }));
}

export type ApplyPaymentsResult = { applied: string[]; rejected: { id: string; reason: string }[]; deferred: string[] };

export async function applyPayments(list: WirePayment[], actor: string): Promise<ApplyPaymentsResult> {
  const out: ApplyPaymentsResult = { applied: [], rejected: [], deferred: [] };
  for (const p of list) {
    try {
      const r = await tx((c) => applyOne(c, p, actor));
      if (r === "ok") out.applied.push(p.id); else if (r === "defer") out.deferred.push(p.id); else out.rejected.push({ id: p.id, reason: r });
    } catch (e) {
      out.rejected.push({ id: p.id, reason: `erro ${(e as { code?: string }).code ?? ""} ${(e as Error).message}`.trim() });
    }
  }
  return out;
}

async function applyOne(c: PoolClient, p: WirePayment, actor: string): Promise<"ok" | "defer" | string> {
  const ex = await c.query<{ status: string; receipt_number: number | null }>("select status, receipt_number from payments where id = $1 for update", [p.id]);
  if (ex.rows[0]) {
    // recibo ainda sem número deste lado (pagamento antigo): passa a ter o do servidor de origem
    if (ex.rows[0].receipt_number == null && p.receiptNumber) {
      await c.query("update payments set receipt_number = $2 where id = $1 and receipt_number is null", [p.id, p.receiptNumber]);
    }
    if (p.status === "voided" && ex.rows[0].status === "confirmed") {
      await c.query(
        `update payments set status = 'voided', voided_at = $2, voided_by = $3, void_reason = $4, status_changed_at = $5, needs_push = false, synced_at = now()
         where id = $1`, [p.id, p.voidedAt, p.voidedBy, p.voidReason, p.statusChangedAt]);
      await c.query("update orders set payment_id = null where payment_id = $1", [p.id]);
      await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync.payment_void','payment',$2,$3)`, [actor, p.id, JSON.stringify({ reason: p.voidReason })]);
    }
    return "ok"; // repetido ou mais antigo: nada a fazer (anulado nunca volta a confirmado)
  }
  const key = await c.query("select 1 from payments where idempotency_key = $1", [p.idempotencyKey]);
  if (key.rows[0]) return "a chave do pagamento já pertence a outro pagamento";
  const orders = await c.query<{ id: string; payment_id: string | null; table_id: number }>(
    "select id, payment_id, table_id from orders where id = any($1) for update", [p.orderIds]);
  if (orders.rows.length < p.orderIds.length) return "defer"; // pedidos ainda a caminho deste lado
  if (orders.rows.some((o) => o.table_id !== p.tableId)) return "pedidos de outra mesa";
  const paidElsewhere = p.status === "confirmed" ? orders.rows.filter((o) => o.payment_id) : [];
  if (paidElsewhere.length) {
    await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync.payment_conflict','payment',$2,$3)`,
      [actor, p.id, JSON.stringify({ amount: p.amount, method: p.method, receivedBy: p.receivedBy, orders: paidElsewhere.map((o) => o.id), otherPayments: paidElsewhere.map((o) => o.payment_id) })]);
    return `CONFLITO: pedido(s) já pago(s) por outro pagamento — ${p.amount} FCFA (${p.method}) recebido por ${p.receivedBy} precisa de revisão do gerente`;
  }
  await c.query(
    `insert into payments (id, origin, table_id, amount, method, tendered, received_by, note, status, voided_at, voided_by, void_reason,
                           idempotency_key, created_at, status_changed_at, needs_push, synced_at, receipt_number)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false,now(),
             -- o número vem da origem; se faltar (versão antiga), o seguinte da série dessa origem
             coalesce($16::int, (select coalesce(max(receipt_number), 0) + 1 from payments where origin = $2)))`,
    [p.id, p.origin, p.tableId, p.amount, p.method, p.tendered, p.receivedBy, p.note, p.status, p.voidedAt, p.voidedBy, p.voidReason,
      p.idempotencyKey, p.createdAt, p.statusChangedAt, p.receiptNumber ?? null]);
  if (p.status === "confirmed") await c.query("update orders set payment_id = $1 where id = any($2)", [p.id, p.orderIds]);
  await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync.payment','payment',$2,$3)`,
    [actor, p.id, JSON.stringify({ amount: p.amount, method: p.method, orderIds: p.orderIds })]);
  return "ok";
}
