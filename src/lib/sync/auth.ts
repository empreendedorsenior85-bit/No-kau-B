import "server-only";
import { connection } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { isLocalServer, syncToken } from "@/lib/node-role";
import { isThrottled, recordFailure } from "@/lib/sessions";
import { setSyncState } from "./orders-sync";

/**
 * Só o servidor local do restaurante fala com estas rotas, com o segredo partilhado NOKAU_SYNC_TOKEN.
 * Sem segredo configurado (ou num servidor local) as rotas não existem (404).
 */
export async function authorizeSync(req: Request): Promise<Response | null> {
  await connection(); // sempre a pedido: nunca pré-renderizar (o token só existe em execução)
  const token = syncToken();
  if (!token || isLocalServer()) return new Response("not found", { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  // tentativas de adivinhar o segredo: limite guardado na base de dados (todas as instâncias)
  const keys = [{ key: `sync-falha|${ip}`, max: 30 }]; // por IP (sem limite global: não deixa bloquear o restaurante de propósito)
  if (await isThrottled(keys)) return new Response("too many", { status: 429 });
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(token).digest();
  if (!got || !timingSafeEqual(a, b)) {
    await recordFailure(keys);
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // último contacto do servidor local (aparece no painel central). No máximo uma escrita a cada 20 s:
  // o servidor local contacta o central a cada ~5 s e cada escrita mantém a base de dados (Neon) acordada.
  const pending = Number(req.headers.get("x-nokau-pending") ?? NaN);
  const now = Date.now();
  if (now - lastPeerWrite > 20_000) {
    lastPeerWrite = now;
    await setSyncState("peer:local", { lastSeenAt: new Date(now).toISOString(), pending: Number.isFinite(pending) ? pending : null }).catch(() => {});
  }
  return null;
}

let lastPeerWrite = 0;
