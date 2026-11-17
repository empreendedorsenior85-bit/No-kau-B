import "server-only";
import { isLocalServer } from "./node-role";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createSession, revokeAllSessions, revokeSession, sessionIdHash, touchSession } from "./sessions";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";
import { isManagerRole } from "./auth-types";

const COOKIE = "nk_session";
const SESSION_HOURS = 12;

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

/** Inicia uma sessão de equipa (guardada no servidor — pode ser terminada a qualquer momento). */
export async function startSession(userId: string) {
  const h = await headers();
  const value = await createSession("staff", userId, SESSION_HOURS * 3600_000, h.get("user-agent"));
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    // servidor local do restaurante: http na rede Wi-Fi (sem certificado) → cookie sem "secure", senão o login falhava
    secure: process.env.NODE_ENV === "production" && !isLocalServer(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

/** Termina ESTA sessão no servidor (o cookie deixa de servir mesmo que tenha sido copiado). */
export async function endSession() {
  const jar = await cookies();
  await revokeSession("staff", jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

/** Termina as outras sessões deste utilizador (ex.: depois de mudar a palavra-passe). Sem `keepCurrent`: todas. */
export async function endOtherSessions(userId: string, keepCurrent = true) {
  const raw = keepCurrent ? (await cookies()).get(COOKIE)?.value : undefined;
  await revokeAllSessions("staff", userId, raw);
}

import type { Role } from "./auth-types";
export type { Role };
export type Manager = { id: string; email: string; role: Role; name: string | null };

/** Valida a assinatura do cookie, a sessão no servidor (existe, não revogada, não expirada) e se a conta continua ativa. */
export async function getManager(): Promise<Manager | null> {
  // cookies() fora do try/catch: o Next usa uma exceção interna para marcar leituras dinâmicas
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  await connection(); // a validade usa a hora atual: só em renderização a pedido, nunca em pré-renderização
  try {
    const idHash = sessionIdHash("staff", raw);
    if (!idHash) return null;
    await ensureMigrated();
    const r = await query<Manager>(
      `select u.id, u.email, u.role, u.name from auth_sessions s join admin_users u on u.id = s.subject
       where s.id_hash = $1 and s.kind = 'staff' and s.revoked_at is null and s.expires_at > now() and u.active`, [idHash]);
    if (r.rows[0]) touchSession(idHash);
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

/** Para páginas da gestão (Admin e Gerente). Sem sessão → login; Garçom → painel de mesas. */
export async function requireManager(): Promise<Manager> {
  const m = await requireStaff();
  if (!isManagerRole(m.role)) redirect("/admin/mesas");
  return m;
}

/** Para páginas da operação, abertas a toda a equipa (inclui Garçom). */
export async function requireStaff(): Promise<Manager> {
  const m = await getManager();
  if (!m) redirect("/admin/login");
  return m;
}
