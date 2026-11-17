import "server-only";
import type { PoolClient } from "pg";
import { query, tx } from "@/lib/db";
import type { ReservationStatus } from "@/lib/types";

/**
 * Reservas na sincronização servidor local ↔ central (mesmo id nos dois lados).
 * As contas de cliente NÃO viajam (customer_id fica só no central). Conflito de decisão (aprovada num lado,
 * rejeitada no outro, sem internet): vence a mais recente e o conflito fica registado na Atividade.
 */
export type WireReservation = {
  id: string; code: string; accessToken: string; origin: "central" | "local"; name: string; phone: string; email: string;
  date: string; time: string; guests: number; notes: string | null; status: ReservationStatus; decidedBy: string | null;
  decidedAt: string | null; decisionNote: string | null; idempotencyKey: string; createdAt: string; statusChangedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const okDate = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const okText = (v: unknown, max: number) => v === null || (typeof v === "string" && v.length <= max);

export function isWireReservation(o: unknown): o is WireReservation {
  const x = o as WireReservation;
  return !!x && typeof x === "object" && UUID.test(x.id) && /^R-[A-Z0-9]{6}$/.test(x.code) && /^[A-Za-z0-9_-]{20,64}$/.test(x.accessToken)
    && (x.origin === "central" || x.origin === "local") && typeof x.name === "string" && x.name.length >= 2 && x.name.length <= 80
    && typeof x.phone === "string" && x.phone.length <= 20 && typeof x.email === "string" && x.email.length <= 160
    && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && /^\d{2}:\d{2}$/.test(x.time) && Number.isInteger(x.guests) && x.guests >= 1 && x.guests <= 30
    && okText(x.notes, 600) && ["pending", "approved", "rejected", "cancelled"].includes(x.status) && okText(x.decidedBy, 160)
    && (x.decidedAt === null || okDate(x.decidedAt)) && okText(x.decisionNote, 300)
    && typeof x.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(x.idempotencyKey) && okDate(x.createdAt) && okDate(x.statusChangedAt);
}

type Row = {
  id: string; code: string; access_token: string; origin: "central" | "local"; name: string; phone: string; email: string; date: string; time: string;
  guests: number; notes: string | null; status: ReservationStatus; decided_by: string | null; decided_at: Date | null; decision_note: string | null;
  idempotency_key: string; created_at: Date; status_changed_at: Date; rev: string;
};
const SELECT = `select id, code, access_token, origin, name, phone, email, to_char(date,'YYYY-MM-DD') date, to_char(time,'HH24:MI') time, guests, notes,
  status, decided_by, decided_at, decision_note, idempotency_key, created_at, status_changed_at, rev from reservations`;
const toWire = (r: Row): WireReservation => ({
  id: r.id, code: r.code, accessToken: r.access_token, origin: r.origin, name: r.name, phone: r.phone, email: r.email, date: r.date, time: r.time,
  guests: r.guests, notes: r.notes, status: r.status, decidedBy: r.decided_by, decidedAt: r.decided_at?.toISOString() ?? null,
  decisionNote: r.decision_note, idempotencyKey: r.idempotency_key, createdAt: r.created_at.toISOString(), statusChangedAt: r.status_changed_at.toISOString(),
});

export async function reservationsChangedAfter(after: number, limit = 200) {
  const r = await query<Row>(`${SELECT} where rev > $1 order by rev asc limit $2`, [after, limit + 1]);
  const more = r.rows.length > limit;
  const rows = r.rows.slice(0, limit);
  const recent = await query<Row>(`${SELECT} where updated_at > now() - interval '2 minutes' order by rev asc limit 300`);
  const seen = new Set(rows.map((x) => x.id));
  return { reservations: [...rows, ...recent.rows.filter((x) => !seen.has(x.id))].map(toWire), cursor: rows.length ? Number(rows[rows.length - 1].rev) : after, more };
}

export async function pendingReservationsPush(limit = 100) {
  const r = await query<Row>(`${SELECT} where needs_push order by created_at asc limit $1`, [limit]);
  return r.rows.map((x) => ({ reservation: toWire(x), rev: x.rev }));
}

export type ApplyResult = { applied: string[]; rejected: { id: string; reason: string }[] };

export async function applyReservations(list: WireReservation[], actor: string): Promise<ApplyResult> {
  const out: ApplyResult = { applied: [], rejected: [] };
  for (const x of list) {
    try {
      const reason = await tx((c) => applyOne(c, x, actor));
      if (reason) out.rejected.push({ id: x.id, reason }); else out.applied.push(x.id);
    } catch (e) {
      out.rejected.push({ id: x.id, reason: `erro ${(e as { code?: string }).code ?? ""} ${(e as Error).message}`.trim() });
    }
  }
  return out;
}

async function applyOne(c: PoolClient, x: WireReservation, actor: string): Promise<string | null> {
  const ex = await c.query<{ status: ReservationStatus; status_changed_at: Date }>("select status, status_changed_at from reservations where id = $1 for update", [x.id]);
  if (ex.rows[0]) {
    if (new Date(x.statusChangedAt) > ex.rows[0].status_changed_at && x.status !== ex.rows[0].status) {
      if (ex.rows[0].status !== "pending" && x.status !== "pending") {
        await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync.reservation_conflict','reservation',$2,$3)`,
          [actor, x.id, JSON.stringify({ was: ex.rows[0].status, now: x.status, by: x.decidedBy })]);
      }
      await c.query(
        `update reservations set status = $2, decided_by = $3, decided_at = $4, decision_note = $5, status_changed_at = $6, needs_push = false, synced_at = now()
         where id = $1`, [x.id, x.status, x.decidedBy, x.decidedAt, x.decisionNote, x.statusChangedAt]);
    }
    return null;
  }
  const dup = await c.query("select 1 from reservations where idempotency_key = $1 or code = $2 or access_token = $3", [x.idempotencyKey, x.code, x.accessToken]);
  if (dup.rows[0]) return "código, link ou chave já pertencem a outra reserva";
  await c.query(
    `insert into reservations (id, code, access_token, origin, name, phone, email, date, time, guests, notes, status, decided_by, decided_at, decision_note,
                               idempotency_key, created_at, status_changed_at, needs_push, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,false,now())`,
    [x.id, x.code, x.accessToken, x.origin, x.name, x.phone, x.email, x.date, x.time, x.guests, x.notes, x.status, x.decidedBy, x.decidedAt, x.decisionNote,
      x.idempotencyKey, x.createdAt, x.statusChangedAt]);
  return null;
}
