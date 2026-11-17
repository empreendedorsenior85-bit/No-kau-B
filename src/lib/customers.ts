import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { z } from "zod";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";
import { hashPassword, verifyPassword } from "./auth";
import { isLocalServer } from "./node-role";

/**
 * Conta do CLIENTE (separada da equipa): nome, email, telefone e palavra-passe (scrypt).
 * Sessão própria (cookie "nk_client", assinado, 30 dias) — nunca dá acesso ao painel.
 * As contas existem só no site central (o servidor local do restaurante não guarda dados pessoais de clientes).
 */
const COOKIE = "nk_client";
const DAYS = 30;

export type Customer = { id: string; name: string; email: string; phone: string };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET em falta (mín. 32 caracteres)");
  return s;
}
// prefixo próprio: uma assinatura de cliente nunca é válida como sessão da equipa (e vice-versa)
const sign = (payload: string) => createHmac("sha256", secret()).update(`cliente:${payload}`).digest("base64url");

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
  if (isLocalServer()) return { ok: false, error: "As contas de cliente são criadas no site do Nô Kau (com internet)." };
  const p = registerSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  await ensureMigrated();
  const dup = await query<{ email: string; phone: string }>("select email, phone from customers where email = $1 or phone = $2", [p.data.email, p.data.phone]);
  // mensagem genérica: não revela se o email/telefone pertence a alguém
  if (dup.rows[0]) return { ok: false, error: "Já existe uma conta com este email ou telefone. Entre com a sua palavra-passe." };
  try {
    const r = await query<Customer>(
      "insert into customers (name, email, phone, password_hash) values ($1,$2,$3,$4) returning id, name, email, phone",
      [p.data.name, p.data.email, p.data.phone, await hashPassword(p.data.password)]);
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
  const exp = Date.now() + DAYS * 86_400_000;
  const payload = `${id}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production" && !isLocalServer(), sameSite: "lax", path: "/", maxAge: DAYS * 86_400,
  });
}

export async function endCustomerSession() {
  (await cookies()).delete(COOKIE);
}

/** Cliente com sessão iniciada (ou null). Valida assinatura, validade e se a conta continua ativa. */
export async function getCustomer(): Promise<Customer | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  await connection();
  try {
    const i = raw.lastIndexOf(".");
    const payload = raw.slice(0, i), sig = raw.slice(i + 1), good = sign(payload);
    if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
    const [id, exp] = payload.split(".");
    if (!id || Number(exp) < Date.now() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    await ensureMigrated();
    const r = await query<Customer>("select id, name, email, phone from customers where id = $1 and active", [id]);
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
