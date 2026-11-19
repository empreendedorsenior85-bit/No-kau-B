import "server-only";
import { randomBytes } from "node:crypto";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";
import { isLocalServer } from "./node-role";
import { RESERVATION_LABEL, type PublicReservation, type Reservation, type ReservationStatus } from "./types";

/**
 * Reservas: o cliente pede no site → Pendente → o Admin/Gerente aprova ou rejeita (com mensagem opcional).
 * O cliente acompanha pelo link secreto (access_token) e é avisado no site quando há decisão.
 * Decidir só acontece a partir de "pendente" (atualização condicional): dois gerentes ao mesmo tempo → só um decide.
 */

type Row = {
  id: string; code: string; name: string; phone: string; email: string | null; date: string; time: string; guests: number; notes: string | null;
  status: ReservationStatus; decided_by: string | null; decided_at: Date | null; decision_note: string | null; created_at: Date; rev: string;
  has_account: boolean;
};
const SELECT = `
  select r.id, r.code, r.name, r.phone, r.email, to_char(r.date, 'YYYY-MM-DD') date, to_char(r.time, 'HH24:MI') time, r.guests, r.notes,
         r.status, r.decided_by, r.decided_at, r.decision_note, r.created_at, r.rev, (r.customer_id is not null) has_account
  from reservations r`;
const toRes = (r: Row): Reservation => ({
  id: r.id, code: r.code, name: r.name, phone: r.phone, email: r.email, date: r.date, time: r.time, guests: r.guests, notes: r.notes,
  status: r.status, decidedBy: r.decided_by, decidedAt: r.decided_at?.toISOString() ?? null, decisionNote: r.decision_note,
  createdAt: r.created_at.toISOString(), rev: Number(r.rev), hasAccount: r.has_account,
});
export const toPublic = (r: Reservation): PublicReservation => ({
  code: r.code, name: r.name, date: r.date, time: r.time, guests: r.guests, notes: r.notes, status: r.status,
  decidedAt: r.decidedAt, decisionNote: r.decisionNote, createdAt: r.createdAt,
});

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I: fácil de ditar ao telefone
const newCode = () => `R-${Array.from(randomBytes(6), (b) => ALPHA[b % ALPHA.length]).join("")}`;
const newToken = () => randomBytes(18).toString("base64url"); // 144 bits: impossível de adivinhar
export const isResToken = (t: string) => /^[A-Za-z0-9_-]{24}$/.test(t);

export type NewReservation = { name: string; phone: string; email: string | null; date: string; time: string; guests: number; notes?: string | null; key: string };

/** Data/hora em Bissau (UTC+0, sem hora de verão). */
const nowBissau = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function createReservation(r: NewReservation, customerId: string | null): Promise<{ ok: true; reservation: Reservation; token: string; duplicate: boolean } | { ok: false; message: string }> {
  await ensureMigrated();
  if (`${r.date} ${r.time}` < nowBissau()) return { ok: false, message: "A data e hora já passaram. Escolha outro horário." };
  const max = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
  if (r.date > max) return { ok: false, message: "Só aceitamos reservas até 6 meses de antecedência." };
  const prev = await query<Row & { access_token: string }>(`${SELECT.replace("from reservations r", ", r.access_token from reservations r")} where r.idempotency_key = $1`, [r.key]);
  if (prev.rows[0]) return { ok: true, reservation: toRes(prev.rows[0]), token: prev.rows[0].access_token, duplicate: true };
  // anti-abuso por contacto (não por IP): no máximo 5 pedidos pendentes por email ou telefone
  const email = r.email?.trim().toLowerCase() || null; // email opcional
  const pend = await query<{ n: string }>("select count(*) n from reservations where status = 'pending' and ((email is not null and lower(email) = $1) or phone = $2)", [email, r.phone]);
  if (Number(pend.rows[0].n) >= 5) return { ok: false, message: "Já tem 5 pedidos de reserva à espera de resposta. Aguarde a decisão do restaurante ou ligue-nos." };
  const local = isLocalServer();
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newToken();
    try {
      const ins = await query<{ id: string }>(
        `insert into reservations (code, access_token, customer_id, name, phone, email, date, time, guests, notes, idempotency_key, origin, needs_push)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [newCode(), token, local ? null : customerId, r.name, r.phone, email, r.date, r.time, r.guests, r.notes?.trim() || null, r.key,
          local ? "local" : "central", local]);
      const row = (await query<Row>(`${SELECT} where r.id = $1`, [ins.rows[0].id])).rows[0];
      await query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'reservation.create','reservation',$2,$3)`,
        [email ?? r.phone, row.id, JSON.stringify({ code: row.code, date: r.date, time: r.time, guests: r.guests })]);
      return { ok: true, reservation: toRes(row), token, duplicate: false };
    } catch (e) {
      const err = e as { code?: string; constraint?: string };
      if (err.code === "23505" && /idempotency/.test(err.constraint ?? "")) {
        const again = await query<Row & { access_token: string }>(`${SELECT.replace("from reservations r", ", r.access_token from reservations r")} where r.idempotency_key = $1`, [r.key]);
        if (again.rows[0]) return { ok: true, reservation: toRes(again.rows[0]), token: again.rows[0].access_token, duplicate: true };
      }
      if (err.code === "23505") continue; // código repetido (raro): gera outro
      throw e;
    }
  }
  throw new Error("Não foi possível gerar um código de reserva único.");
}

/** Reservas pelos links secretos do cliente (até 20). */
export async function reservationsByTokens(tokens: string[]): Promise<PublicReservation[]> {
  const ok = [...new Set(tokens.filter(isResToken))].slice(0, 20);
  if (!ok.length) return [];
  await ensureMigrated();
  const r = await query<Row>(`${SELECT} where r.access_token = any($1) order by r.date desc, r.time desc`, [ok]);
  return r.rows.map((x) => toPublic(toRes(x)));
}

export async function reservationByToken(token: string): Promise<PublicReservation | null> {
  return (await reservationsByTokens([token]))[0] ?? null;
}

export async function customerReservations(customerId: string): Promise<(PublicReservation & { token: string })[]> {
  await ensureMigrated();
  const r = await query<Row & { access_token: string }>(
    `${SELECT.replace("from reservations r", ", r.access_token from reservations r")} where r.customer_id = $1 order by r.date desc, r.time desc limit 100`, [customerId]);
  return r.rows.map((x) => ({ ...toPublic(toRes(x)), token: x.access_token }));
}

/** O cliente cancela (só enquanto está pendente). */
export async function cancelReservation(token: string): Promise<PublicReservation | null> {
  if (!isResToken(token)) return null;
  await ensureMigrated();
  const u = await query<{ id: string }>(
    `update reservations set status = 'cancelled', status_changed_at = now(), decided_at = now(), decided_by = 'cliente', needs_push = $2
     where access_token = $1 and status = 'pending' returning id`, [token, isLocalServer()]);
  if (u.rows[0]) await query(`insert into audit_log (actor, action, entity, entity_id) values ('cliente','reservation.cancel','reservation',$1)`, [u.rows[0].id]);
  return reservationByToken(token);
}

export type DecideResult = { ok: true; reservation: Reservation } | { ok: false; message: string; reservation?: Reservation };

/** Aprovar ou rejeitar. Só a partir de "pendente": se outra pessoa já decidiu, devolve o estado atual e diz quem. */
export async function decideReservation(id: string, to: "approved" | "rejected", note: string | null, actor: string): Promise<DecideResult> {
  await ensureMigrated();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Reserva inválida." };
  const msg = note?.trim().slice(0, 300) || null;
  const u = await query<{ id: string }>(
    `update reservations set status = $2, decided_by = $3, decided_at = now(), decision_note = $4, status_changed_at = now(), needs_push = $5
     where id = $1 and status = 'pending' returning id`, [id, to, actor, msg, isLocalServer()]);
  const row = (await query<Row>(`${SELECT} where r.id = $1`, [id])).rows[0];
  if (!row) return { ok: false, message: "Reserva não encontrada." };
  if (!u.rows[0]) {
    const cur = toRes(row);
    return { ok: false, reservation: cur, message: cur.status === "cancelled" ? "O cliente cancelou esta reserva." : `Esta reserva já foi ${RESERVATION_LABEL[cur.status].toLowerCase()} por ${cur.decidedBy ?? "outra pessoa"}.` };
  }
  await query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,$2,'reservation',$3,$4)`,
    [actor, `reservation.${to === "approved" ? "approve" : "reject"}`, id, JSON.stringify({ code: row.code, note: msg })]);
  return { ok: true, reservation: toRes(row) };
}

/** Painel: pendentes + todas as de hoje em diante + decididas nas últimas 48 h (para o tempo real). */
export async function reservationsSnapshot(): Promise<Reservation[]> {
  await ensureMigrated();
  const r = await query<Row>(
    `${SELECT} where r.status = 'pending' or r.date >= (now() at time zone 'UTC')::date or r.status_changed_at > now() - interval '48 hours'
     order by r.date, r.time limit 500`);
  return r.rows.map(toRes);
}

export async function reservationsChangedSince(cursor: number): Promise<Reservation[]> {
  await ensureMigrated();
  const fresh = await query<Row>(`${SELECT} where r.rev > $1 order by r.rev asc limit 200`, [cursor]);
  const late = await query<Row>(`${SELECT} where r.rev <= $1 and r.updated_at > now() - interval '20 seconds' order by r.rev desc limit 100`, [cursor]);
  return [...fresh.rows, ...late.rows].map(toRes);
}

/** Histórico com filtros (até 1000). */
export async function reservationHistory(f: { from: string; to: string; status?: ReservationStatus | null; q?: string | null }): Promise<Reservation[]> {
  await ensureMigrated();
  const q = f.q?.trim() ? `%${f.q.trim().toLowerCase()}%` : null;
  const r = await query<Row>(
    `${SELECT} where r.date between $1::date and $2::date and ($3::text is null or r.status = $3)
       and ($4::text is null or lower(r.name) like $4 or r.phone like $4 or lower(coalesce(r.email, '')) like $4 or lower(r.code) like $4)
     order by r.date desc, r.time desc limit 1000`, [f.from, f.to, f.status ?? null, q]);
  return r.rows.map(toRes);
}

/** Intervalo por defeito do histórico: últimos 30 dias até 90 dias à frente (datas de Bissau = UTC). */
export function historyRange(from: string | null, to: string | null) {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  return { today: day(0), from: from ?? day(-30), to: to ?? day(90) };
}
