import "server-only";
import { isLocalServer } from "./node-role";
import { createHmac, randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";

const COOKIE = "nk_session";
const SESSION_HOURS = 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET em falta (mín. 32 caracteres)");
  return s;
}

const scryptAsync = (pw: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, len, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  // com utilizador inexistente corre-se na mesma um hash (tempo constante, sem revelar emails)
  const parts = (stored ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==").split("$");
  const salt = Buffer.from(parts[1] ?? "", "base64");
  const expected = Buffer.from(parts[2] ?? "", "base64");
  const got = await scryptAsync(pw, salt, expected.length || 64);
  return !!stored && expected.length === got.length && timingSafeEqual(expected, got);
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export async function startSession(userId: string) {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${userId}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    // servidor local do restaurante: http na rede Wi-Fi (sem certificado) → cookie sem "secure", senão o login falhava
    secure: process.env.NODE_ENV === "production" && !isLocalServer(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

import type { Role } from "./auth-types";
export type { Role };
export type Manager = { id: string; email: string; role: Role };

/** Valida assinatura, validade e se o utilizador continua ativo na base de dados. */
export async function getManager(): Promise<Manager | null> {
  // cookies() fora do try/catch: o Next usa uma exceção interna para marcar leituras dinâmicas
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  await connection(); // a validade usa a hora atual: só em renderização a pedido, nunca em pré-renderização
  try {
    await ensureMigrated().catch(() => {}); // papéis antigos -> novos (se ainda não migrados)
    const i = raw.lastIndexOf(".");
    const payload = raw.slice(0, i);
    const sig = raw.slice(i + 1);
    const good = sign(payload);
    if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
    const [uid, exp] = payload.split(".");
    if (!uid || Number(exp) < Date.now()) return null;
    const r = await query<Manager>("select id, email, role from admin_users where id = $1 and active", [uid]);
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Só Admin: os restantes são reencaminhados para os pedidos. */
export async function requireAdmin(): Promise<Manager> {
  const m = await requireManager();
  if (m.role !== "admin") redirect("/admin/dashboard");
  return m;
}

/** Para páginas: redireciona para o login. */
export async function requireManager(): Promise<Manager> {
  const m = await getManager();
  if (!m) redirect("/admin/login");
  return m;
}

// --- limitação de tentativas de login (por instância) ---
const fails = new Map<string, { n: number; until: number }>();
export function loginLocked(key: string): boolean {
  const f = fails.get(key);
  return !!f && f.n >= 5 && f.until > Date.now();
}
export function loginFailed(key: string) {
  const f = fails.get(key);
  const now = Date.now();
  fails.set(key, !f || f.until < now ? { n: 1, until: now + 15 * 60_000 } : { n: f.n + 1, until: now + 15 * 60_000 });
}
export function loginOk(key: string) {
  fails.delete(key);
}
