import "server-only";
import type { PoolClient } from "pg";
import { query, tx } from "@/lib/db";

/**
 * Contas de cliente na sincronização servidor local ↔ central.
 *  - central → local: todas as contas (para o cliente entrar e pedir no Wi-Fi do restaurante mesmo sem internet);
 *  - local → central: contas criadas no restaurante;
 *  - vai o HASH da palavra-passe (scrypt), nunca a palavra-passe;
 *  - a mesma pessoa registada nos dois lados (mesmo email ou telefone, ids diferentes): a conta do central é a válida
 *    e a outra passa a pseudónimo (customer_aliases) — os pedidos feitos com ela ficam na conta do central.
 */
export type WireCustomer = {
  id: string; name: string; email: string; phone: string; passwordHash: string; active: boolean;
  origin: "central" | "local"; createdAt: string; updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const okDate = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

export function isWireCustomer(o: unknown): o is WireCustomer {
  const x = o as WireCustomer;
  return !!x && typeof x === "object" && UUID.test(x.id)
    && typeof x.name === "string" && x.name.length >= 2 && x.name.length <= 80
    && typeof x.email === "string" && x.email.length >= 5 && x.email.length <= 160
    && typeof x.phone === "string" && /^\+?[0-9]{7,15}$/.test(x.phone)
    && typeof x.passwordHash === "string" && /^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(x.passwordHash)
    && typeof x.active === "boolean" && (x.origin === "central" || x.origin === "local") && okDate(x.createdAt) && okDate(x.updatedAt);
}

type Row = { id: string; name: string; email: string; phone: string; password_hash: string; active: boolean; origin: "central" | "local"; created_at: Date; updated_at: Date; rev: string };
const SELECT = "select id, name, email, phone, password_hash, active, origin, created_at, updated_at, rev from customers";
const toWire = (r: Row): WireCustomer => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, passwordHash: r.password_hash, active: r.active, origin: r.origin,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

/** Contas alteradas depois de `after` (rev), em páginas. */
export async function customersChangedAfter(after: number, limit = 500) {
  const r = await query<Row>(`${SELECT} where rev > $1 order by rev asc limit $2`, [after, limit + 1]);
  const more = r.rows.length > limit;
  const rows = r.rows.slice(0, limit);
  return { customers: rows.map(toWire), cursor: rows.length ? Number(rows[rows.length - 1].rev) : after, more };
}

export async function pendingCustomersPush(limit = 100) {
  const r = await query<Row>(`${SELECT} where needs_push order by created_at asc limit $1`, [limit]);
  return r.rows.map(toWire);
}

export async function markCustomersPushed(ids: string[]) {
  if (ids.length) await query("update customers set needs_push = false where id = any($1)", [ids]);
}

export type ApplyCustomersResult = { applied: string[]; aliased: { id: string; to: string }[]; rejected: { id: string; reason: string }[] };

/**
 * `side`: quem está a aplicar. "central" recebe contas do restaurante; "local" recebe as do central (que vencem sempre).
 */
export async function applyCustomers(list: WireCustomer[], side: "central" | "local", actor: string): Promise<ApplyCustomersResult> {
  const out: ApplyCustomersResult = { applied: [], aliased: [], rejected: [] };
  for (const w of list) {
    try {
      const r = await tx((c) => applyOne(c, w, side, actor));
      if (r === "ok") out.applied.push(w.id); else if (typeof r === "object") out.aliased.push({ id: w.id, to: r.to }); else out.rejected.push({ id: w.id, reason: r });
    } catch (e) {
      out.rejected.push({ id: w.id, reason: `erro ${(e as { code?: string }).code ?? ""} ${(e as Error).message}`.trim() });
    }
  }
  return out;
}

async function applyOne(c: PoolClient, w: WireCustomer, side: "central" | "local", actor: string): Promise<"ok" | { to: string } | string> {
  const ex = await c.query<{ updated_at: Date; needs_push: boolean }>("select updated_at, needs_push from customers where id = $1 for update", [w.id]);
  if (ex.rows[0]) {
    // mesma conta: vence a alteração mais recente (palavra-passe mudada, conta desativada…)
    if (new Date(w.updatedAt) > ex.rows[0].updated_at) {
      await c.query(
        `update customers set name = $2, email = $3, phone = $4, password_hash = $5, active = $6, needs_push = false where id = $1`,
        [w.id, w.name, w.email, w.phone, w.passwordHash, w.active]);
      if (!w.active) await c.query("update auth_sessions set revoked_at = now() where kind = 'client' and subject = $1 and revoked_at is null", [w.id]);
    }
    return "ok";
  }
  const dup = await c.query<{ id: string }>("select id from customers where (email = $1 or phone = $2) and id <> $3 limit 1 for update", [w.email, w.phone, w.id]);
  if (dup.rows[0]) {
    const other = dup.rows[0].id;
    if (side === "central") {
      // conta criada no restaurante por alguém que já tinha conta no central: fica pseudónimo da conta do central
      await c.query("insert into customer_aliases (alias_id, customer_id) values ($1,$2) on conflict (alias_id) do nothing", [w.id, other]);
      await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync.customer_alias','customer',$2,$3)`,
        [actor, other, JSON.stringify({ alias: w.id, origin: w.origin })]);
      return { to: other };
    }
    // no restaurante: a conta do central vence; a local (duplicada) passa para ela — pedidos, reservas e sessões
    await insert(c, w);
    await c.query("update orders set customer_id = $2 where customer_id = $1", [other, w.id]);
    await c.query("update reservations set customer_id = $2 where customer_id = $1", [other, w.id]);
    await c.query("update auth_sessions set subject = $2 where kind = 'client' and subject = $1", [other, w.id]);
    await c.query("insert into customer_aliases (alias_id, customer_id) values ($1,$2) on conflict (alias_id) do nothing", [other, w.id]);
    await c.query("delete from customers where id = $1", [other]);
    await c.query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync.customer_merge','customer',$2,$3)`,
      [actor, w.id, JSON.stringify({ merged: other })]);
    return "ok";
  }
  await insert(c, w);
  return "ok";
}

async function insert(c: PoolClient, w: WireCustomer) {
  // a conta duplicada (se houver) tem de sair do caminho das restrições únicas antes de inserir a do central
  await c.query(
    `update customers set email = email || '#dup-' || left(id::text, 8), phone = '+9' || lpad(abs(hashtext(id::text))::text, 12, '0'), needs_push = false
     where (email = $1 or phone = $2) and id <> $3`, [w.email, w.phone, w.id]);
  await c.query(
    `insert into customers (id, name, email, phone, password_hash, active, origin, created_at, needs_push) values ($1,$2,$3,$4,$5,$6,$7,$8,false)`,
    [w.id, w.name, w.email, w.phone, w.passwordHash, w.active, w.origin, w.createdAt]);
}

/** Conta a usar para um pedido sincronizado: a própria, a do central (se for pseudónimo) ou nenhuma (desconhecida). */
export async function resolveCustomer(c: PoolClient, id: string | null | undefined): Promise<string | null> {
  if (!id || !UUID.test(id)) return null;
  const r = await c.query<{ id: string }>(
    `select coalesce((select customer_id from customer_aliases where alias_id = $1), (select id from customers where id = $1)) id`, [id]);
  return r.rows[0]?.id ?? null;
}
