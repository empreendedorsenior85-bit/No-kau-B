import "server-only";
import { log } from "@/lib/log";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Ligação à base de dados — apenas no servidor. Em Supabase use a string do "pooler"
 * (Connection Pooling) em DATABASE_URL. As credenciais nunca chegam ao navegador.
 *
 * Em alojamento sem estado (Vercel + Neon) as ligações do pool podem ser cortadas entre pedidos
 * (função congelada, base de dados a "adormecer"). Por isso:
 *  - erros transitórios são repetidos automaticamente (a transação inteira, nunca meia);
 *  - uma ligação partida é DESTRUÍDA e nunca devolvida ao pool (senão falhava todos os pedidos seguintes).
 */
const g = globalThis as unknown as { __nokauPool?: Pool };

export function dbConfigured() {
  return !!process.env.DATABASE_URL;
}

function pool(): Pool {
  if (!g.__nokauPool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error("DATABASE_URL não configurada");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(raw);
    // o modo SSL é definido abaixo (explícito); retirá-lo do URL evita o aviso de alteração futura do driver
    const u = new URL(raw);
    u.searchParams.delete("sslmode");
    g.__nokauPool = new Pool({
      connectionString: u.toString(),
      max: 4,
      idleTimeoutMillis: 10_000,
      // a base gratuita pode demorar a "acordar" (>8 s); 15 s evita falhas no primeiro pedido do dia
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
      // cifrado e com verificação do certificado. DATABASE_SSL_NO_VERIFY=1 só para fornecedores com certificados não verificáveis.
      ssl: local ? false : { rejectUnauthorized: process.env.DATABASE_SSL_NO_VERIFY !== "1" },
    });
    g.__nokauPool.on("error", (e) => log.error("db.idle_client_error", { error: e.message }));
  }
  return g.__nokauPool;
}

const TRANSIENT_CODES = new Set([
  "ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND",
  "57P01", "57P02", "57P03", // base de dados a desligar/arrancar
  "08000", "08001", "08003", "08004", "08006", // ligação
  "53300", // demasiadas ligações
  "40001", "40P01", // serialização / deadlock: repetir a transação resolve
]);
const TRANSIENT_MSG = /connection terminated|timeout exceeded when trying to connect|terminating connection|client has encountered a connection error|connection error|socket hang up|read econnreset|the database system is (starting up|shutting down)/i;

/** Erro de rede/ligação que vale a pena repetir. Erros de dados (ex.: duplicado) nunca são repetidos. */
export function isTransient(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return (!!err?.code && TRANSIENT_CODES.has(err.code)) || TRANSIENT_MSG.test(err?.message ?? "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retrying<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransient(e) || i >= tries - 1) throw e;
      log.warn("db.transient_retry", { error: (e as Error).message, attempt: i + 2, tries });
      await sleep(250 * 2 ** i);
    }
  }
}

export function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return retrying(() => pool().query<T>(text, params));
}

async function txOnce<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  let broken: Error | undefined;
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    if (isTransient(e)) broken = e as Error; // ligação partida: não tentar "rollback" nela
    else await c.query("rollback").catch((r) => { broken = r as Error; });
    throw e;
  } finally {
    c.release(broken); // com erro, o cliente é destruído e substituído por uma ligação nova
  }
}

/** Transação com repetição automática. A função recebida deve ser repetível (só operações na base de dados). */
export function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return retrying(() => txOnce(fn));
}
