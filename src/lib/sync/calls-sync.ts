import "server-only";
import type { PoolClient } from "pg";
import { query, tx } from "@/lib/db";
import type { CallKind, CallStatus } from "@/lib/types";

/** Chamadas de clientes na sincronização servidor local ↔ central (mesmo id nos dois lados; vence a alteração mais recente). */
export type WireCall = {
  id: string;
  origin: "central" | "local";
  tableId: number;
  kind: CallKind;
  status: CallStatus;
  amount: number | null;
  idempotencyKey: string;
  createdAt: string;
  statusChangedAt: string;
  ackAt: string | null;
  ackBy: string | null;
  doneAt: string | null;
  doneBy: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const okDate = (v: unknown) => v === null || (typeof v === "string" && !Number.isNaN(Date.parse(v)));
const okText = (v: unknown) => v === null || (typeof v === "string" && v.length <= 200);

export function isWireCall(o: unknown): o is WireCall {
  const x = o as WireCall;
  return !!x && typeof x === "object" && UUID.test(x.id) && (x.origin === "central" || x.origin === "local") && Number.isInteger(x.tableId)
    && ["waiter", "manager", "bill"].includes(x.kind) && ["open", "ack", "done", "cancelled"].includes(x.status)
    && (x.amount === null || (Number.isInteger(x.amount) && x.amount >= 0))
    && typeof x.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(x.idempotencyKey)
    && okDate(x.createdAt) && x.createdAt !== null && okDate(x.statusChangedAt) && x.statusChangedAt !== null
    && okDate(x.ackAt) && okDate(x.doneAt) && okText(x.ackBy) && okText(x.doneBy);
}

type Row = {
  id: string; origin: "central" | "local"; table_id: number; kind: CallKind; status: CallStatus; amount: number | null; idempotency_key: string;
  created_at: Date; status_changed_at: Date; ack_at: Date | null; ack_by: string | null; done_at: Date | null; done_by: string | null; rev: string;
};
const COLS = "id, origin, table_id, kind, status, amount, idempotency_key, created_at, status_changed_at, ack_at, ack_by, done_at, done_by, rev";
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const toWire = (r: Row): WireCall => ({
  id: r.id, origin: r.origin, tableId: r.table_id, kind: r.kind, status: r.status, amount: r.amount, idempotencyKey: r.idempotency_key,
  createdAt: r.created_at.toISOString(), statusChangedAt: r.status_changed_at.toISOString(), ackAt: iso(r.ack_at), ackBy: r.ack_by,
  doneAt: iso(r.done_at), doneBy: r.done_by,
});

export async function callsChangedAfter(after: number, limit = 200): Promise<{ calls: WireCall[]; cursor: number; more: boolean }> {
  const r = await query<Row>(`select ${COLS} from service_calls where rev > $1 order by rev asc limit $2`, [after, limit + 1]);
  const more = r.rows.length > limit;
  const rows = r.rows.slice(0, limit);
  const recent = await query<Row>(`select ${COLS} from service_calls where updated_at > now() - interval '2 minutes' order by rev asc limit 300`);
  const seen = new Set(rows.map((x) => x.id));
  return { calls: [...rows, ...recent.rows.filter((x) => !seen.has(x.id))].map(toWire), cursor: rows.length ? Number(rows[rows.length - 1].rev) : after, more };
}

export async function pendingCallsPush(limit = 100): Promise<{ call: WireCall; rev: string }[]> {
  const r = await query<Row>(`select ${COLS} from service_calls where needs_push order by created_at asc limit $1`, [limit]);
  return r.rows.map((x) => ({ call: toWire(x), rev: x.rev }));
}

export type ApplyResult = { applied: string[]; rejected: { id: string; reason: string }[] };

export async function applyCalls(calls: WireCall[]): Promise<ApplyResult> {
  const out: ApplyResult = { applied: [], rejected: [] };
  for (const c of calls) {
    try {
      const reason = await tx((cl) => applyOne(cl, c));
      if (reason) out.rejected.push({ id: c.id, reason }); else out.applied.push(c.id);
    } catch (e) {
      out.rejected.push({ id: c.id, reason: `erro ${(e as { code?: string }).code ?? ""} ${(e as Error).message}`.trim() });
    }
  }
  return out;
}

async function applyOne(c: PoolClient, x: WireCall): Promise<string | null> {
  const ex = await c.query<{ status_changed_at: Date }>("select status_changed_at from service_calls where id = $1 for update", [x.id]);
  if (ex.rows[0]) {
    if (new Date(x.statusChangedAt) > ex.rows[0].status_changed_at) {
      await c.query(
        `update service_calls set status = $2, status_changed_at = $3, ack_at = $4, ack_by = $5, done_at = $6, done_by = $7, needs_push = false, synced_at = now()
         where id = $1`, [x.id, x.status, x.statusChangedAt, x.ackAt, x.ackBy, x.doneAt, x.doneBy]);
    }
    return null;
  }
  const key = await c.query("select 1 from service_calls where idempotency_key = $1", [x.idempotencyKey]);
  if (key.rows[0]) return "a chave da chamada já pertence a outra chamada";
  const t = await c.query("select 1 from dining_tables where id = $1", [x.tableId]);
  if (!t.rows[0]) return `mesa ${x.tableId} desconhecida`;
  await c.query(
    `insert into service_calls (id, origin, table_id, kind, status, amount, idempotency_key, created_at, status_changed_at, ack_at, ack_by, done_at, done_by, needs_push, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,now())`,
    [x.id, x.origin, x.tableId, x.kind, x.status, x.amount, x.idempotencyKey, x.createdAt, x.statusChangedAt, x.ackAt, x.ackBy, x.doneAt, x.doneBy]);
  return null;
}
