import "server-only";
import { cookies, headers } from "next/headers";
import { createSession, revokeSession, sessionIdHash, touchSession } from "./sessions";
import { connection } from "next/server";
import { z } from "zod";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";
import { hashPassword, verifyPassword } from "./auth";
import { isLocalServer } from "./node-role";

/**
 * Conta do CLIENTE (separada da equipa): nome, email, telefone e palavra-passe (scrypt).
 * Sessão própria (cookie "nk_client", guardada no servidor, 30 dias) — nunca dá acesso ao painel.
 * As contas existem no site central e são copiadas para o servidor do restaurante (para entrar e pedir sem internet);
 * as criadas no restaurante seguem para o central (ver sync/customers-sync.ts).
 */
const COOKIE = "nk_client";
const DAYS = 30;

export type Customer = { id: string; name: string; email: string; phone: string };

/** Telefone guineense: "955 000 000" → "+245955000000"; números internacionais com "+" ficam como estão. */
export function normalizePhone(raw: string): string {
  const t = raw.replace(/[\s().-]/g, "");
  if (/^00\d+$/.test(t)) return `+${t.slice(2)}`;
  if (/^\d{9}$/.test(t)) return `+245${t}`;
  return t;
}

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Indique o seu nome.").max(80, "Nome demasiado longo."),
  email: z.email("Email inválido.").max(160).transform((v) => v.toLowerCase()),
  phone: z.string().transform(normalizePhone).refine((v) => /^\+?\d{7,15}$/.test(v), "Telefone inválido (ex.: 955 000 000)."),
  password: z.string().min(8, "A palavra-passe precisa de pelo menos 8 caracteres.").max(200),
});

export type RegisterResult = { ok: true; customer: Customer } | { ok: false; error: string };

export async function registerCustomer(input: unknown): Promise<RegisterResult> {
  const p = registerSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  await ensureMigrated();
  const dup = await query<{ email: string; phone: string }>("select email, phone from customers where email = $1 or phone = $2", [p.data.email, p.data.phone]);
  // mensagem genérica: não revela se o email/telefone pertence a alguém
  if (dup.rows[0]) return { ok: false, error: "Já existe uma conta com este email ou telefone. Entre com a sua palavra-passe." };
  try {
    const r = await query<Customer>(
      // no servidor do restaurante a conta é criada aqui e enviada ao site central na sincronização
      "insert into customers (name, email, phone, password_hash, origin, needs_push) values ($1,$2,$3,$4,$5,$6) returning id, name, email, phone",
      [p.data.name, p.data.email, p.data.phone, await hashPassword(p.data.password), isLocalServer() ? "local" : "central", isLocalServer()]);
    return { ok: true, customer: r.rows[0] };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, error: "Já existe uma conta com este email ou telefone. Entre com a sua palavra-passe." };
    throw e;
  }
}

/** Entrar com email OU telefone. Tempo constante mesmo quando a conta não existe (verifyPassword). */
export async function authenticateCustomer(identifier: string, password: string): Promise<Customer | null> {
  await ensureMigrated();
  const id = identifier.trim();
  const byEmail = id.includes("@");
  const r = await query<Customer & { password_hash: string }>(
    `select id, name, email, phone, password_hash from customers where active and ${byEmail ? "email = $1" : "phone = $1"}`,
    [byEmail ? id.toLowerCase() : normalizePhone(id)]);
  const ok = await verifyPassword(password, r.rows[0]?.password_hash ?? null);
  if (!ok || !r.rows[0]) return null;
  const { password_hash: _, ...c } = r.rows[0];
  void _;
  return c;
}

export async function startCustomerSession(id: string) {
  const value = await createSession("client", id, DAYS * 86_400_000, (await headers()).get("user-agent"));
  (await cookies()).set(COOKIE, value, {
    httpOnly: true, secure: process.env.NODE_ENV === "production" && !isLocalServer(), sameSite: "lax", path: "/", maxAge: DAYS * 86_400,
  });
}

/** Termina ESTA sessão no servidor (um cookie copiado deixa de servir). */
export async function endCustomerSession() {
  const jar = await cookies();
  await revokeSession("client", jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

/** Cliente com sessão iniciada (ou null). Valida a assinatura, a sessão no servidor e se a conta continua ativa. */
export async function getCustomer(): Promise<Customer | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  await connection();
  try {
    const idHash = sessionIdHash("client", raw);
    if (!idHash) return null;
    await ensureMigrated();
    const r = await query<Customer>(
      `select c.id, c.name, c.email, c.phone from auth_sessions s join customers c on c.id = s.subject
       where s.id_hash = $1 and s.kind = 'client' and s.revoked_at is null and s.expires_at > now() and c.active`, [idHash]);
    if (r.rows[0]) touchSession(idHash);
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

export type CustomerOrder = {
  id: string; number: number; origin: "central" | "local"; tableLabel: string; status: "pending" | "preparing" | "done"; total: number;
  createdAt: string; paid: boolean; paymentMethod: string | null; items: { name: string; quantity: number; unitPrice: number }[];
};

/** Histórico do cliente (mais recentes primeiro). */
export async function customerOrders(customerId: string, limit = 100): Promise<CustomerOrder[]> {
  const r = await query<{ id: string; number: number; origin: "central" | "local"; table_label: string; status: CustomerOrder["status"]; total: number; created_at: Date; paid: boolean; method: string | null; items: CustomerOrder["items"] }>(
    `select o.id, o.number, o.origin, t.label table_label, o.status, o.total, o.created_at,
            (p.id is not null and p.status = 'confirmed') paid, case when p.status = 'confirmed' then p.method end method,
            coalesce((select json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unitPrice', i.unit_price) order by i.id)
                      from order_items i where i.order_id = o.id), '[]'::json) items
     from orders o join dining_tables t on t.id = o.table_id left join payments p on p.id = o.payment_id
     where o.customer_id = $1 order by o.created_at desc limit $2`, [customerId, limit]);
  return r.rows.map((x) => ({
    id: x.id, number: x.number, origin: x.origin, tableLabel: x.table_label, status: x.status, total: x.total,
    createdAt: x.created_at.toISOString(), paid: x.paid, paymentMethod: x.method, items: x.items,
  }));
}
