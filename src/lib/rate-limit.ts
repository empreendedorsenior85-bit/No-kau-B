import "server-only";

/**
 * Limite simples por IP em memória (por instância). Suficiente para a Fase 3;
 * na Fase 4 passa para armazenamento partilhado (Postgres/Redis) + Turnstile.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max = 5, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

/** Só consulta (não conta): já atingiu o limite? */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  return (hits.get(key) ?? []).filter((t) => now - t < windowMs).length >= max;
}

// ---------- limite partilhado (base de dados): vale para todas as instâncias e sobrevive a reinícios ----------
import { createHash } from "node:crypto";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";
import { log } from "./log";

/**
 * Janela fixa por chave (guardada como hash: sem IPs nem contactos em claro). Para ações que gravam dados
 * (pedidos, chamadas, contas, reservas). Se a base de dados falhar, NÃO bloqueia o cliente (falha aberta).
 */
export async function rateLimitShared(key: string, max: number, windowMs: number): Promise<boolean> {
  try {
    await ensureMigrated();
    const r = await query<{ fails: number }>(
      `insert into auth_throttle (key_hash, fails, window_until) values ($1, 1, now() + make_interval(secs => $2))
       on conflict (key_hash) do update set
         fails = case when auth_throttle.window_until < now() then 1 else auth_throttle.fails + 1 end,
         window_until = case when auth_throttle.window_until < now() then now() + make_interval(secs => $2) else auth_throttle.window_until end
       returning fails`,
      [createHash("sha256").update(`limite|${key}`).digest("hex"), Math.round(windowMs / 1000)]);
    return (r.rows[0]?.fails ?? 0) <= max;
  } catch (e) {
    log.warn("rate_limit.db_unavailable", { error: (e as Error).message });
    return true;
  }
}
