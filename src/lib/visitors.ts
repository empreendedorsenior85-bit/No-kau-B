import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";
import { isLocalServer } from "./node-role";
import { normalizePhone } from "./customers";
import { createSession, revokeSession, sessionIdHash, touchSession } from "./sessions";
import { toPublic } from "./reservations";
import type { PublicReservation } from "./types";

/**
 * Perfil de VISITANTE (sem palavra-passe, SMS ou email): nome completo, telefone e email opcional, guardados quando
 * faz uma reserva. O perfil fica ligado ao APARELHO (cookie "nk_visitor", sessão no servidor, 1 ano) e mostra as
 * reservas feitas nele. Noutro aparelho, cada reserva junta-se com telefone + código dessa reserva.
 * Privacidade: o telefone sozinho nunca dá acesso a reservas (sem SMS não se prova que o número é da pessoa).
 */
const COOKIE = "nk_visitor";
const DAYS = 365;

export type Visitor = { id: string; name: string; phone: string; email: string | null };

export async function getVisitor(): Promise<Visitor | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  await connection();
  try {
    const h = sessionIdHash("visitor", raw);
    if (!h) return null;
    await ensureMigrated();
    const r = await query<Visitor>(
      `select v.id, v.name, v.phone, v.email from auth_sessions s join visitors v on v.id = s.subject
       where s.id_hash = $1 and s.kind = 'visitor' and s.revoked_at is null and s.expires_at > now()`, [h]);
    if (r.rows[0]) touchSession(h);
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function startVisitorSession(id: string) {
  const value = await createSession("visitor", id, DAYS * 86_400_000, (await headers()).get("user-agent"));
  (await cookies()).set(COOKIE, value, {
    httpOnly: true, secure: process.env.NODE_ENV === "production" && !isLocalServer(), sameSite: "lax", path: "/", maxAge: DAYS * 86_400,
  });
}

/** Esquecer este aparelho (termina a sessão no servidor). As reservas continuam válidas e acessíveis pelo código. */
export async function forgetVisitorDevice() {
  const jar = await cookies();
  await revokeSession("visitor", jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

/**
 * Depois de uma reserva: guarda/atualiza o perfil deste aparelho e liga-lhe a reserva.
 * Primeira reserva no aparelho → cria o perfil e a sessão.
 */
export async function attachReservationToVisitor(reservationId: string, data: { name: string; phone: string; email: string | null }) {
  await ensureMigrated();
  const phone = normalizePhone(data.phone);
  let v = await getVisitor();
  if (v) {
    await query("update visitors set name = $2, phone = $3, email = coalesce($4, email), updated_at = now() where id = $1", [v.id, data.name, phone, data.email]);
  } else {
    const r = await query<{ id: string }>("insert into visitors (name, phone, email) values ($1,$2,$3) returning id", [data.name, phone, data.email]);
    await startVisitorSession(r.rows[0].id);
    v = { id: r.rows[0].id, name: data.name, phone, email: data.email };
  }
  await query("insert into visitor_reservations (visitor_id, reservation_id, via) values ($1,$2,'created') on conflict do nothing", [v.id, reservationId]);
}

/** Reservas deste aparelho (mais recentes primeiro), com o link secreto de cada uma. */
export async function visitorReservations(visitorId: string): Promise<(PublicReservation & { token: string })[]> {
  const r = await query<{ id: string; code: string; name: string; phone: string; email: string | null; date: string; time: string; guests: number; notes: string | null;
    status: PublicReservation["status"]; decided_at: Date | null; decision_note: string | null; created_at: Date; access_token: string }>(
    `select r.id, r.code, r.name, r.phone, r.email, to_char(r.date,'YYYY-MM-DD') date, to_char(r.time,'HH24:MI') time, r.guests, r.notes, r.status,
            r.decided_at, r.decision_note, r.created_at, r.access_token
     from visitor_reservations vr join reservations r on r.id = vr.reservation_id
     where vr.visitor_id = $1 order by r.date desc, r.time desc limit 50`, [visitorId]);
  return r.rows.map((x) => ({
    ...toPublic({
      id: x.id, code: x.code, name: x.name, phone: x.phone, email: x.email, date: x.date, time: x.time, guests: x.guests, notes: x.notes, status: x.status,
      decidedBy: null, decidedAt: x.decided_at?.toISOString() ?? null, decisionNote: x.decision_note, createdAt: x.created_at.toISOString(),
    } as Parameters<typeof toPublic>[0]),
    token: x.access_token,
  }));
}

/**
 * Juntar uma reserva feita noutro aparelho: telefone + código (R-XXXXXX). Só essa reserva fica neste aparelho.
 * Devolve false se não houver uma reserva com esse código E esse telefone (a mesma resposta nos dois casos).
 * Com `customerId` (cliente com sessão iniciada) liga a reserva à conta em vez de ao aparelho.
 */
export async function claimReservation(phoneRaw: string, codeRaw: string, customerId: string | null = null): Promise<boolean> {
  await ensureMigrated();
  const code = codeRaw.trim().toUpperCase().replace(/^R(?!-)/, "R-");
  if (!/^R-[A-Z0-9]{6}$/.test(code)) return false;
  const phone = normalizePhone(phoneRaw);
  const r = await query<{ id: string; name: string; phone: string; email: string | null }>(
    "select id, name, phone, email from reservations where code = $1", [code]);
  const res = r.rows[0];
  if (!res || normalizePhone(res.phone) !== phone) return false;
  // cliente com conta: a reserva passa a estar na conta (só se ainda não pertencer a outra conta)
  if (customerId) {
    await query("update reservations set customer_id = $2 where id = $1 and customer_id is null", [res.id, customerId]);
    return true;
  }
  let v = await getVisitor();
  if (!v) {
    const ins = await query<{ id: string }>("insert into visitors (name, phone, email) values ($1,$2,$3) returning id", [res.name, phone, res.email]);
    await startVisitorSession(ins.rows[0].id);
    v = { id: ins.rows[0].id, name: res.name, phone, email: res.email };
  }
  await query("insert into visitor_reservations (visitor_id, reservation_id, via) values ($1,$2,'code') on conflict do nothing", [v.id, res.id]);
  return true;
}
