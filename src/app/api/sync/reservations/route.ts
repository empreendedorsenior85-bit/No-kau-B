import { authorizeSync } from "@/lib/sync/auth";
import { applyReservations, reservationsChangedAfter, isWireReservation } from "@/lib/sync/reservations-sync";
import { ensureMigrated } from "@/db/init";

export const maxDuration = 60;

/** Reservas alteradas no central depois do cursor (rev). */
export async function GET(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return Response.json({ error: "cursor inválido" }, { status: 400 });
  return Response.json(await reservationsChangedAfter(after), { headers: { "Cache-Control": "no-store" } });
}

/** Reservas (novas ou com estado alterado) enviadas pelo servidor local. Idempotente; inválidas voltam recusadas. */
export async function POST(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  if (Number(req.headers.get("content-length") ?? 0) > 1_000_000) return Response.json({ error: "demasiado grande" }, { status: 413 });
  const body = (await req.json().catch(() => null)) as { reservations?: unknown[] } | null;
  if (!body || !Array.isArray(body.reservations) || body.reservations.length > 100) return Response.json({ error: "formato inválido" }, { status: 400 });
  const r = await applyReservations(body.reservations.filter(isWireReservation), "servidor-local");
  for (const c of body.reservations) {
    if (isWireReservation(c)) continue;
    const id = (c as { id?: unknown })?.id;
    if (typeof id === "string" && id.length <= 64) r.rejected.push({ id, reason: "formato inválido" });
  }
  if (r.rejected.length) console.error("[sync] reservas recusadas:", JSON.stringify(r.rejected));
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
