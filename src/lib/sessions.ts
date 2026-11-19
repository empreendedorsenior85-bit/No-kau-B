import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";

/**
 * Sessões guardadas no servidor (equipa e clientes) e limite de tentativas de login.
 *
 * Cookie = segredo aleatório (256 bits) + assinatura HMAC. Na base de dados fica só o HASH do segredo:
 * quem ler a base de dados não consegue entrar com ele. Uma sessão pode ser terminada a qualquer momento:
 *  - "Terminar sessão" revoga essa sessão (um cookie copiado deixa de servir);
 *  - mudar/redefinir a palavra-passe ou desativar a conta termina as outras sessões dessa pessoa.
 */
export type SessionKind = "staff" | "client" | "visitor";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET em falta (mín. 32 caracteres)");
  return s;
}
const mac = (kind: SessionKind, sid: string) => createHmac("sha256", secret()).update(`sessao:${kind}:${sid}`).digest("base64url");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Valida o formato e a assinatura do cookie (sem ir à base de dados). Devolve o hash do segredo, ou null. */
export function sessionIdHash(kind: SessionKind, raw: string | undefined): string | null {
  if (!raw || raw.length > 200) return null;
  const i = raw.indexOf(".");
  if (i < 1) return null;
  const sid = raw.slice(0, i), sig = raw.slice(i + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(sid)) return null;
  const good = mac(kind, sid);
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  return sha(sid);
}

/** Cria a sessão e devolve o valor do cookie. */
export async function createSession(kind: SessionKind, subject: string, ttlMs: number, userAgent: string | null): Promise<string> {
  await ensureMigrated();
  const sid = randomBytes(32).toString("base64url");
  await query(
    `insert into auth_sessions (id_hash, kind, subject, expires_at, user_agent) values ($1,$2,$3, now() + make_interval(secs => $4), $5)`,
    [sha(sid), kind, subject, Math.round(ttlMs / 1000), userAgent?.slice(0, 200) ?? null]);
  // limpeza ocasional das sessões expiradas há mais de 7 dias
  if (Math.random() < 0.05) query("delete from auth_sessions where expires_at < now() - interval '7 days'").catch(() => {});
  return `${sid}.${mac(kind, sid)}`;
}

/** Marca a sessão como ativa (no máximo uma escrita a cada 5 minutos). */
export function touchSession(idHash: string) {
  query("update auth_sessions set last_seen_at = now() where id_hash = $1 and last_seen_at < now() - interval '5 minutes'", [idHash]).catch(() => {});
}

export async function revokeSession(kind: SessionKind, raw: string | undefined) {
  const h = sessionIdHash(kind, raw);
  if (h) await query("update auth_sessions set revoked_at = now() where id_hash = $1 and revoked_at is null", [h]).catch(() => {});
}

/** Termina todas as sessões de uma pessoa (exceto, opcionalmente, a atual). */
export async function revokeAllSessions(kind: SessionKind, subject: string, keepRaw?: string) {
  const keep = sessionIdHash(kind, keepRaw);
  await query(
    "update auth_sessions set revoked_at = now() where kind = $1 and subject = $2 and revoked_at is null and ($3::text is null or id_hash <> $3)",
    [kind, subject, keep]);
}

// ---------- limite de tentativas (partilhado entre instâncias, guardado na base de dados) ----------
const WINDOW_MIN = 15;
export type ThrottleKey = { key: string; max: number };

/**
 * Chaves recomendadas para um login:
 *  - por IP + conta (5 falhas) — trava quem tenta adivinhar a palavra-passe de alguém;
 *  - por conta (20 falhas, qualquer IP) — trava ataques distribuídos e IPs falsificados (ex.: servidor local sem proxy).
 */
export const loginKeys = (scope: string, ip: string, account: string): ThrottleKey[] => [
  { key: `${scope}|ip|${ip}|${account}`, max: 5 },
  { key: `${scope}|conta|${account}`, max: 20 },
];

export async function isThrottled(keys: ThrottleKey[]): Promise<boolean> {
  await ensureMigrated();
  const r = await query<{ key_hash: string; fails: number }>(
    "select key_hash, fails from auth_throttle where key_hash = any($1) and window_until > now()", [keys.map((k) => sha(k.key))]);
  return r.rows.some((row) => row.fails >= (keys.find((k) => sha(k.key) === row.key_hash)?.max ?? Infinity));
}

export async function recordFailure(keys: ThrottleKey[]) {
  for (const k of keys) {
    await query(
      `insert into auth_throttle (key_hash, fails, window_until) values ($1, 1, now() + make_interval(mins => $2))
       on conflict (key_hash) do update set
         fails = case when auth_throttle.window_until < now() then 1 else auth_throttle.fails + 1 end,
         window_until = now() + make_interval(mins => $2)`,
      [sha(k.key), WINDOW_MIN]);
  }
  if (Math.random() < 0.05) query("delete from auth_throttle where window_until < now() - interval '1 day'").catch(() => {});
}

export async function clearFailures(keys: ThrottleKey[]) {
  await query("delete from auth_throttle where key_hash = any($1)", [keys.map((k) => sha(k.key))]);
}
