import "server-only";
import { query, tx } from "./db";
import { ensureMigrated } from "@/db/init";
import { isLocalServer } from "./node-role";
import { PAYMENT_METHODS, type PaymentMethod } from "./types";

/**
 * Pagamentos feitos EM MÃO no restaurante e confirmados pelo gerente (Admin/Gerente).
 * Regras (garantidas no servidor e na base de dados):
 *  - o valor é SEMPRE a soma dos pedidos escolhidos, calculada aqui — o navegador não decide valores;
 *  - um pedido só pode ser pago uma vez (bloqueio das linhas + verificação na mesma transação);
 *  - um pagamento confirmado nunca se altera nem se apaga: só se anula, com motivo (trigger na base de dados);
 *  - fica registado quem recebeu, quando, como, quanto e (em numerário) o valor entregue e o troco.
 */

export type Payment = {
  id: string; tableId: number; tableLabel: string; amount: number; method: PaymentMethod; tendered: number | null; change: number | null;
  receivedBy: string; note: string | null; status: "confirmed" | "voided"; voidedAt: string | null; voidedBy: string | null; voidReason: string | null;
  createdAt: string; orders: { id: string; number: number; origin: "central" | "local"; total: number }[];
};

type Row = {
  id: string; table_id: number; table_label: string; amount: number; method: PaymentMethod; tendered: number | null; received_by: string;
  note: string | null; status: "confirmed" | "voided"; voided_at: Date | null; voided_by: string | null; void_reason: string | null; created_at: Date;
  orders: Payment["orders"];
};
const SELECT = `
  select p.id, p.table_id, t.label table_label, p.amount, p.method, p.tendered, p.received_by, p.note, p.status, p.voided_at, p.voided_by,
         p.void_reason, p.created_at,
         coalesce((select json_agg(json_build_object('id', o.id, 'number', o.number, 'origin', o.origin, 'total', o.total) order by o.created_at)
                   from orders o where o.payment_id = p.id), '[]'::json) orders
  from payments p join dining_tables t on t.id = p.table_id`;
const toPayment = (r: Row): Payment => ({
  id: r.id, tableId: r.table_id, tableLabel: r.table_label, amount: r.amount, method: r.method, tendered: r.tendered,
  change: r.tendered != null ? r.tendered - r.amount : null, receivedBy: r.received_by, note: r.note, status: r.status,
  voidedAt: r.voided_at?.toISOString() ?? null, voidedBy: r.voided_by, voidReason: r.void_reason, createdAt: r.created_at.toISOString(), orders: r.orders,
});

export type ConfirmInput = { tableId: number; orderIds: string[]; method: string; tendered?: number | null; note?: string | null; key: string };
export type ConfirmResult = { ok: true; payment: Payment; duplicate: boolean } | { ok: false; message: string };

export async function confirmPayment(input: ConfirmInput, actor: string): Promise<ConfirmResult> {
  await ensureMigrated();
  const { tableId, method, key } = input;
  const orderIds = [...new Set(input.orderIds)];
  if (!Number.isInteger(tableId)) return { ok: false, message: "Mesa inválida." };
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) return { ok: false, message: "Escolha o método de pagamento." };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return { ok: false, message: "Pedido inválido. Atualize a página." };
  if (orderIds.length === 0 || orderIds.length > 100 || !orderIds.every((id) => /^[0-9a-f-]{36}$/i.test(id))) return { ok: false, message: "Escolha os pedidos a pagar." };
  const note = input.note?.trim().slice(0, 200) || null;
  try {
    return await tx(async (c): Promise<ConfirmResult> => {
      const prev = await c.query<{ id: string }>("select id from payments where idempotency_key = $1", [key]);
      if (prev.rows[0]) return { ok: true, payment: toPayment((await c.query<Row>(`${SELECT} where p.id = $1`, [prev.rows[0].id])).rows[0]), duplicate: true };
      // bloqueia os pedidos: dois gerentes a cobrar a mesma conta ao mesmo tempo → só um consegue
      const o = await c.query<{ id: string; table_id: number; total: number; payment_id: string | null; is_test: boolean }>(
        "select id, table_id, total, payment_id, is_test from orders where id = any($1) for update", [orderIds]);
      if (o.rows.length !== orderIds.length) return { ok: false, message: "Algum pedido já não existe. Atualize a página." };
      if (o.rows.some((r) => r.table_id !== tableId)) return { ok: false, message: "Todos os pedidos têm de ser desta mesa." };
      if (o.rows.some((r) => r.payment_id)) return { ok: false, message: "Algum destes pedidos já foi pago. Atualize a página." };
      if (o.rows.some((r) => r.is_test)) return { ok: false, message: "Pedidos de teste (demonstração) não se cobram." };
      const amount = o.rows.reduce((n, r) => n + r.total, 0);
      if (amount <= 0) return { ok: false, message: "Valor a pagar inválido." };
      let tendered: number | null = null;
      if (method === "cash" && input.tendered != null && input.tendered !== 0) {
        if (!Number.isInteger(input.tendered) || input.tendered < amount) return { ok: false, message: "O valor recebido em numerário é menor do que o total." };
        if (input.tendered > amount * 20 + 100_000) return { ok: false, message: "Valor recebido improvável — confirme o montante." };
        tendered = input.tendered;
      }
      const local = isLocalServer();
      const ins = await c.query<{ id: string }>(
        `insert into payments (table_id, amount, method, tendered, received_by, note, idempotency_key, origin, needs_push)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [tableId, amount, method, tendered, actor, note, key, local ? "local" : "central", local]);
      const pid = ins.rows[0].id;
      await c.query("update orders set payment_id = $1 where id = any($2)", [pid, orderIds]);
      // a conta foi entregue: o pedido de conta da mesa fica resolvido
      await c.query(
        `update service_calls set status = 'done', status_changed_at = now(), done_at = now(), done_by = $2, ack_at = coalesce(ack_at, now()),
           ack_by = coalesce(ack_by, $2), needs_push = $3
         where table_id = $1 and kind = 'bill' and status in ('open','ack')`, [tableId, actor, local]);
      await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'payment.confirm','payment',$2,$3)`,
        [actor, pid, JSON.stringify({ tableId, amount, method, tendered, orderIds })]);
      return { ok: true, payment: toPayment((await c.query<Row>(`${SELECT} where p.id = $1`, [pid])).rows[0]), duplicate: false };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      const r = await query<Row>(`${SELECT} where p.idempotency_key = $1`, [key]);
      if (r.rows[0]) return { ok: true, payment: toPayment(r.rows[0]), duplicate: true };
    }
    throw e;
  }
}

/** Anular (engano, devolução): exige motivo; os pedidos voltam a ficar por pagar. Nunca apaga. */
export async function voidPayment(id: string, reason: string, actor: string): Promise<{ ok: true; payment: Payment } | { ok: false; message: string }> {
  await ensureMigrated();
  const why = reason.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Pagamento inválido." };
  if (why.length < 3 || why.length > 200) return { ok: false, message: "Indique o motivo da anulação (3 a 200 caracteres)." };
  return tx(async (c) => {
    const u = await c.query(
      `update payments set status = 'voided', voided_at = now(), voided_by = $2, void_reason = $3, status_changed_at = now(), needs_push = $4
       where id = $1 and status = 'confirmed' returning id`, [id, actor, why, isLocalServer()]);
    if (!u.rows[0]) return { ok: false as const, message: "Este pagamento já foi anulado ou não existe." };
    await c.query("update orders set payment_id = null where payment_id = $1", [id]);
    await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'payment.void','payment',$2,$3)`, [actor, id, JSON.stringify({ reason: why })]);
    return { ok: true as const, payment: toPayment((await c.query<Row>(`${SELECT} where p.id = $1`, [id])).rows[0]) };
  });
}

export type PaymentSummary = { count: number; total: number; voided: number; byMethod: { method: PaymentMethod; count: number; total: number }[] };

/** Pagamentos num intervalo [from, to): lista (até 1000) e totais por método (só confirmados). */
export async function listPayments(from: Date, to: Date): Promise<{ payments: Payment[]; summary: PaymentSummary }> {
  await ensureMigrated();
  const [rows, sums] = await Promise.all([
    query<Row>(`${SELECT} where p.created_at >= $1 and p.created_at < $2 order by p.created_at desc limit 1000`, [from, to]),
    query<{ method: PaymentMethod; n: string; total: string; voided: string }>(
      `select method, count(*) filter (where status = 'confirmed') n, coalesce(sum(amount) filter (where status = 'confirmed'), 0) total,
              count(*) filter (where status = 'voided') voided
       from payments where created_at >= $1 and created_at < $2 group by method`, [from, to]),
  ]);
  const byMethod = sums.rows.map((r) => ({ method: r.method, count: Number(r.n), total: Number(r.total) })).filter((m) => m.count > 0)
    .sort((a, b) => b.total - a.total);
  return {
    payments: rows.rows.map(toPayment),
    summary: {
      count: byMethod.reduce((n, m) => n + m.count, 0), total: byMethod.reduce((n, m) => n + m.total, 0),
      voided: sums.rows.reduce((n, r) => n + Number(r.voided), 0), byMethod,
    },
  };
}
