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
