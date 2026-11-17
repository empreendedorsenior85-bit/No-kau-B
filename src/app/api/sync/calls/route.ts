import { log } from "@/lib/log";
import { authorizeSync } from "@/lib/sync/auth";
import { applyCalls, callsChangedAfter, isWireCall } from "@/lib/sync/calls-sync";
import { ensureMigrated } from "@/db/init";

export const maxDuration = 60;

/** Chamadas alteradas no central depois do cursor (rev). */
export async function GET(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return Response.json({ error: "cursor inválido" }, { status: 400 });
  return Response.json(await callsChangedAfter(after), { headers: { "Cache-Control": "no-store" } });
}

/** Chamadas (novas ou com estado alterado) enviadas pelo servidor local. Idempotente; inválidas voltam recusadas. */
export async function POST(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  if (Number(req.headers.get("content-length") ?? 0) > 1_000_000) return Response.json({ error: "demasiado grande" }, { status: 413 });
  const body = (await req.json().catch(() => null)) as { calls?: unknown[] } | null;
  if (!body || !Array.isArray(body.calls) || body.calls.length > 100) return Response.json({ error: "formato inválido" }, { status: 400 });
  const r = await applyCalls(body.calls.filter(isWireCall));
  for (const c of body.calls) {
    if (isWireCall(c)) continue;
    const id = (c as { id?: unknown })?.id;
    if (typeof id === "string" && id.length <= 64) r.rejected.push({ id, reason: "formato inválido" });
  }
  if (r.rejected.length) log.warn("sync.calls_rejected", { rejected: r.rejected });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
