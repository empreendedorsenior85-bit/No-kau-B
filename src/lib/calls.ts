import "server-only";
import type { PoolClient } from "pg";
import { query, tx } from "./db";
import { ensureMigrated } from "@/db/init";
import { isLocalServer } from "./node-role";
import type { CallKind, CallStatus, ServiceCall } from "./types";

/**
 * Chamadas do cliente a partir do menu da mesa: chamar empregado, chamar gerente, pedir a conta.
 * Estados: open (à espera) → ack (a caminho) → done (resolvida); o cliente pode cancelar enquanto está "open".
 * Uma só chamada ativa por tipo e por mesa: tocar outra vez devolve a mesma (sem duplicar alertas).
 */

type Row = {
  id: string; table_id: number; table_number: number; table_label: string; waiter_id: string | null; kind: CallKind; status: CallStatus;
  amount: number | null; created_at: Date; ack_at: Date | null; ack_by: string | null; done_at: Date | null; done_by: string | null; rev: string;
};
const SELECT = `
  select s.id, s.table_id, t.number as table_number, t.label as table_label, t.waiter_id, s.kind, s.status, s.amount,
         s.created_at, s.ack_at, s.ack_by, s.done_at, s.done_by, s.rev
  from service_calls s join dining_tables t on t.id = s.table_id`;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const toCall = (r: Row): ServiceCall => ({
  id: r.id, tableId: r.table_id, tableNumber: r.table_number, tableLabel: r.table_label, waiterId: r.waiter_id, kind: r.kind, status: r.status,
  amount: r.amount, createdAt: r.created_at.toISOString(), ackAt: iso(r.ack_at), ackBy: r.ack_by, doneAt: iso(r.done_at), doneBy: r.done_by, rev: Number(r.rev),
});

export const CALL_KINDS: CallKind[] = ["waiter", "manager", "bill"];
const MAX_PER_10MIN = 12;

export type CreateCallResult =
  | { ok: true; call: ServiceCall; duplicate: boolean }
  | { ok: false; code: "invalid_table" | "rate_limited"; message: string };

/** Total da conta: pedidos da mesa (não de teste) desde a última conta entregue — no máximo das últimas 12 h. */
const BILL_SQL = `
  select coalesce(sum(o.total), 0)::int n from orders o
  where o.table_id = $1 and not o.is_test
    and o.created_at > greatest(now() - interval '12 hours',
      coalesce((select max(done_at) from service_calls where table_id = $1 and kind = 'bill' and status = 'done'), '-infinity'))`;

export async function createCall(token: string, kind: CallKind, key: string): Promise<CreateCallResult> {
  await ensureMigrated();
  try {
    return await tx(async (c): Promise<CreateCallResult> => {
      // bloqueia a mesa: dois toques ao mesmo tempo não criam duas chamadas
      const t = await c.query<{ id: number }>("select id from dining_tables where qr_token = $1 and active for update", [token]);
      if (!t.rows[0]) return { ok: false, code: "invalid_table", message: "Este QR Code já não é válido. Peça ajuda a um empregado." };
      const tableId = t.rows[0].id;
      const same = await c.query<{ id: string }>("select id from service_calls where idempotency_key = $1", [key]);
      const active = same.rows[0] ?? (await c.query<{ id: string }>(
        "select id from service_calls where table_id = $1 and kind = $2 and status in ('open','ack') order by created_at desc limit 1", [tableId, kind])).rows[0];
      if (active) return { ok: true, call: (await byId(c, active.id))!, duplicate: true };
      const n = await c.query<{ n: string }>("select count(*) n from service_calls where table_id = $1 and created_at > now() - interval '10 minutes'", [tableId]);
      if (Number(n.rows[0].n) >= MAX_PER_10MIN) return { ok: false, code: "rate_limited", message: "Muitas chamadas em pouco tempo. Um empregado já foi avisado." };
      const amount = kind === "bill" ? (await c.query<{ n: number }>(BILL_SQL, [tableId])).rows[0].n : null;
      const local = isLocalServer();
      const ins = await c.query<{ id: string }>(
        `insert into service_calls (table_id, kind, amount, idempotency_key, origin, needs_push) values ($1,$2,$3,$4,$5,$6) returning id`,
        [tableId, kind, amount, key, local ? "local" : "central", local]);
      await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ('cliente','call.create','service_call',$1,$2)`,
        [ins.rows[0].id, JSON.stringify({ tableId, kind, amount })]);
      return { ok: true, call: (await byId(c, ins.rows[0].id))!, duplicate: false };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") { // corrida com a mesma chave
      const r = await query<Row>(`${SELECT} where s.idempotency_key = $1`, [key]);
      if (r.rows[0]) return { ok: true, call: toCall(r.rows[0]), duplicate: true };
    }
    throw e;
  }
}

async function byId(c: PoolClient, id: string): Promise<ServiceCall | null> {
  const r = await c.query<Row>(`${SELECT} where s.id = $1`, [id]);
  return r.rows[0] ? toCall(r.rows[0]) : null;
}

/** Chamadas da mesa para o cliente: ativas + resolvidas/canceladas nos últimos 10 min. Exige o token da mesa. */
export async function callsForTable(token: string): Promise<ServiceCall[]> {
  await ensureMigrated();
  const r = await query<Row>(
    `${SELECT} where t.qr_token = $1 and (s.status in ('open','ack') or s.status_changed_at > now() - interval '10 minutes')
     order by s.created_at desc limit 20`, [token]);
  return r.rows.map(toCall);
}

/** O cliente cancela (só enquanto ninguém respondeu). */
export async function cancelCall(token: string, id: string): Promise<ServiceCall | null> {
  await ensureMigrated();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await query<{ id: string }>(
    `update service_calls s set status = 'cancelled', status_changed_at = now(), needs_push = $3
     from dining_tables t where s.id = $1 and t.id = s.table_id and t.qr_token = $2 and s.status = 'open' returning s.id`,
    [id, token, isLocalServer()]);
  const row = (await query<Row>(`${SELECT} where s.id = $1 and t.qr_token = $2`, [id, token])).rows[0];
  if (r.rows[0]) await query(`insert into audit_log (actor, action, entity, entity_id) values ('cliente','call.cancel','service_call',$1)`, [id]);
  return row ? toCall(row) : null;
}

export type CallActionResult = { ok: true; call: ServiceCall } | { ok: false; message: string };

/** Equipa: "a caminho" (ack) ou "resolvida" (done). Só transições válidas e a partir do estado que a pessoa estava a ver. */
export async function setCallStatus(id: string, to: "ack" | "done", actor: string): Promise<CallActionResult> {
  await ensureMigrated();
  const from = to === "ack" ? ["open"] : ["open", "ack"];
  const r = await query<{ id: string }>(
    `update service_calls set status = $2, status_changed_at = now(), needs_push = $4,
       ack_at = case when $2 = 'ack' then now() else coalesce(ack_at, now()) end,
       ack_by = case when $2 = 'ack' then $3 else coalesce(ack_by, $3) end,
       done_at = case when $2 = 'done' then now() else done_at end,
       done_by = case when $2 = 'done' then $3 else done_by end
     where id = $1 and status = any($5) returning id`,
    [id, to, actor, isLocalServer(), from]);
  const row = (await query<Row>(`${SELECT} where s.id = $1`, [id])).rows[0];
  if (!row) return { ok: false, message: "Chamada não encontrada." };
  if (r.rows[0]) await query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'call.status','service_call',$2,$3)`,
    [actor, id, JSON.stringify({ to })]);
  return { ok: true, call: toCall(row) }; // já mudada por outra pessoa: devolve o estado atual
}

/** Painel: ativas + resolvidas nas últimas 3 h. */
export async function callsSnapshot(): Promise<ServiceCall[]> {
  await ensureMigrated();
  const r = await query<Row>(`${SELECT} where s.status in ('open','ack') or s.status_changed_at > now() - interval '3 hours' order by s.created_at desc limit 300`);
  return r.rows.map(toCall);
}

/** Tempo real: o que é novo (rev > cursor) primeiro; depois a janela de 20 s abaixo do cursor. */
export async function callsChangedSince(cursor: number): Promise<ServiceCall[]> {
  await ensureMigrated();
  const fresh = await query<Row>(`${SELECT} where s.rev > $1 order by s.rev asc limit 200`, [cursor]);
  const late = await query<Row>(`${SELECT} where s.rev <= $1 and s.updated_at > now() - interval '20 seconds' order by s.rev desc limit 100`, [cursor]);
  return [...fresh.rows, ...late.rows].map(toCall);
}

export type CallHistoryRow = ServiceCall & { ackSeconds: number | null; doneSeconds: number | null; waiterName: string | null };

/** Histórico de atendimento num intervalo [from, to). Até 500 chamadas, as mais recentes primeiro. */
export async function callHistory(from: Date, to: Date): Promise<CallHistoryRow[]> {
  await ensureMigrated();
  const r = await query<Row & { ack_s: number | null; done_s: number | null; waiter_name: string | null }>(
    `select s.id, s.table_id, t.number as table_number, t.label as table_label, t.waiter_id, s.kind, s.status, s.amount,
            s.created_at, s.ack_at, s.ack_by, s.done_at, s.done_by, s.rev,
            extract(epoch from (s.ack_at - s.created_at))::int ack_s, extract(epoch from (s.done_at - s.created_at))::int done_s,
            coalesce(w.name, split_part(w.email, '@', 1)) waiter_name
     from service_calls s join dining_tables t on t.id = s.table_id left join admin_users w on w.id = t.waiter_id
     where s.created_at >= $1 and s.created_at < $2
     order by s.created_at desc limit 500`, [from, to]);
  return r.rows.map((x) => ({ ...toCall(x), ackSeconds: x.ack_s, doneSeconds: x.done_s, waiterName: x.waiter_name }));
}

export type CallStats = {
  total: number; waiter: number; manager: number; bill: number; cancelled: number; unresolved: number;
  avgAck: number | null; avgDone: number | null; within2min: number | null;
  byPerson: { pessoa: string; atendidas: number; mediaResposta: number | null; mediaResolucao: number | null }[];
  byTable: { mesa: string; chamadas: number; mediaResposta: number | null }[];
};

/**
 * Indicadores de atendimento (SQL, sem limite de linhas). "Resposta" = desde a chamada até alguém tocar
 * em "A caminho" (ou "Resolvido", se resolveu logo). Canceladas pelo cliente não contam para os tempos.
 */
export async function callStats(from: Date, to: Date): Promise<CallStats> {
  await ensureMigrated();
  const base = "from service_calls s join dining_tables t on t.id = s.table_id where s.created_at >= $1 and s.created_at < $2";
  const [k, people, tables] = await Promise.all([
    query<{ total: string; waiter: string; manager: string; bill: string; cancelled: string; unresolved: string; avg_ack: string | null; avg_done: string | null; fast: string | null }>(
      `select count(*) total, count(*) filter (where s.kind = 'waiter') waiter, count(*) filter (where s.kind = 'manager') manager,
              count(*) filter (where s.kind = 'bill') bill, count(*) filter (where s.status = 'cancelled') cancelled,
              count(*) filter (where s.status in ('open','ack')) unresolved,
              round(avg(extract(epoch from (s.ack_at - s.created_at))) filter (where s.ack_at is not null)) avg_ack,
              round(avg(extract(epoch from (s.done_at - s.created_at))) filter (where s.done_at is not null)) avg_done,
              round(100.0 * count(*) filter (where s.ack_at is not null and s.ack_at - s.created_at <= interval '2 minutes')
                    / nullif(count(*) filter (where s.status <> 'cancelled'), 0)) fast
       ${base}`, [from, to]),
    query<{ pessoa: string; n: string; ack: string | null; done: string | null }>(
      `select coalesce(s.ack_by, s.done_by) pessoa, count(*) n,
              round(avg(extract(epoch from (s.ack_at - s.created_at)))) ack, round(avg(extract(epoch from (s.done_at - s.created_at)))) done
       ${base} and coalesce(s.ack_by, s.done_by) is not null group by 1 order by n desc limit 50`, [from, to]),
    query<{ mesa: string; n: string; ack: string | null }>(
      `select t.label mesa, count(*) n, round(avg(extract(epoch from (s.ack_at - s.created_at)))) ack
       ${base} group by t.label, t.number order by n desc, t.number limit 50`, [from, to]),
  ]);
  const num = (v: string | null) => (v == null ? null : Number(v));
  const x = k.rows[0];
  return {
    total: Number(x.total), waiter: Number(x.waiter), manager: Number(x.manager), bill: Number(x.bill), cancelled: Number(x.cancelled),
    unresolved: Number(x.unresolved), avgAck: num(x.avg_ack), avgDone: num(x.avg_done), within2min: num(x.fast),
    byPerson: people.rows.map((p) => ({ pessoa: p.pessoa, atendidas: Number(p.n), mediaResposta: num(p.ack), mediaResolucao: num(p.done) })),
    byTable: tables.rows.map((t) => ({ mesa: t.mesa, chamadas: Number(t.n), mediaResposta: num(t.ack) })),
  };
}

/** Para o cliente: sem nomes da equipa nem ids internos de mesa. */
export function publicView(c: ServiceCall) {
  return { id: c.id, kind: c.kind, status: c.status, amount: c.amount, createdAt: c.createdAt };
}
export type PublicCall = ReturnType<typeof publicView>;
