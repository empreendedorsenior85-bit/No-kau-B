"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateCustomer, endCustomerSession, normalizePhone, registerCustomer, startCustomerSession } from "@/lib/customers";
import { clearFailures, isThrottled, loginKeys, recordFailure } from "@/lib/sessions";
import { rateLimitShared } from "@/lib/rate-limit";
import { query } from "@/lib/db";

export type ClientFormState = { error?: string; values?: Record<string, string> };

/** Só regressa a páginas do próprio site (sem redirecionamentos abertos para fora). */
function safeReturn(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return /^\/m\/[A-Za-z0-9_-]{22}$/.test(s) || /^\/cliente\/recibos\/[0-9a-f-]{36}$/.test(s) || s === "/cliente" ? s : "/cliente";
}
async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function registerAction(_: ClientFormState, fd: FormData): Promise<ClientFormState> {
  const values = { name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), phone: String(fd.get("phone") ?? "") };
  // limite alto: no restaurante todos os clientes saem pelo MESMO IP do Wi-Fi; isto só trava criação em massa
  if (!(await rateLimitShared(`cliente-registo:${await ip()}`, 300, 60 * 60_000))) return { error: "Demasiadas contas criadas a partir desta rede. Tente mais tarde.", values };
  if (fd.get("password") !== fd.get("password2")) return { error: "As palavras-passe não coincidem.", values };
  if (fd.get("consent") !== "on") return { error: "Para criar a conta, aceite a utilização dos seus dados (abaixo).", values };
  const r = await registerCustomer({ ...values, password: fd.get("password") });
  if (!r.ok) return { error: r.error, values };
  await startCustomerSession(r.customer.id);
  await query(`insert into audit_log (actor, action, entity, entity_id) values ($1,'customer.register','customer',$2)`, [r.customer.email, r.customer.id]);
  redirect(safeReturn(fd.get("volta")));
}

export async function clientLoginAction(_: ClientFormState, fd: FormData): Promise<ClientFormState> {
  const id = String(fd.get("identifier") ?? "").trim();
  // a mesma conta escrita de formas diferentes ("955 000 000" / "+245955000000") conta como uma só
  const keys = loginKeys("cliente", await ip(), id.includes("@") ? id.toLowerCase() : normalizePhone(id));
  if (await isThrottled(keys)) return { error: "Demasiadas tentativas. Aguarde 15 minutos.", values: { identifier: id } };
  const c = await authenticateCustomer(id, String(fd.get("password") ?? ""));
  if (!c) { await recordFailure(keys); return { error: "Email/telefone ou palavra-passe incorretos.", values: { identifier: id } }; }
  await clearFailures(keys);
  await startCustomerSession(c.id);
  redirect(safeReturn(fd.get("volta")));
}

export async function clientLogoutAction(fd: FormData) {
  await endCustomerSession();
  redirect(safeReturn(fd.get("volta")) === "/cliente" ? "/cliente/entrar" : safeReturn(fd.get("volta")));
}
