import { log } from "@/lib/log";
import { authorizeSync } from "@/lib/sync/auth";
import { applyCustomers, customersChangedAfter, isWireCustomer } from "@/lib/sync/customers-sync";
import { ensureMigrated } from "@/db/init";

export const maxDuration = 60;

/** Contas de cliente alteradas no central depois do cursor (rev) — para o servidor do restaurante. */
export async function GET(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return Response.json({ error: "cursor inválido" }, { status: 400 });
  return Response.json(await customersChangedAfter(after), { headers: { "Cache-Control": "no-store" } });
}

/** Contas criadas no restaurante. Idempotente; a mesma pessoa já registada no central passa a pseudónimo dessa conta. */
export async function POST(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  if (Number(req.headers.get("content-length") ?? 0) > 1_000_000) return Response.json({ error: "demasiado grande" }, { status: 413 });
  const body = (await req.json().catch(() => null)) as { customers?: unknown[] } | null;
  if (!body || !Array.isArray(body.customers) || body.customers.length > 100) return Response.json({ error: "formato inválido" }, { status: 400 });
  const r = await applyCustomers(body.customers.filter(isWireCustomer), "central", "servidor-local");
  for (const c of body.customers) {
    if (isWireCustomer(c)) continue;
    const id = (c as { id?: unknown })?.id;
    if (typeof id === "string" && id.length <= 64) r.rejected.push({ id, reason: "formato inválido" });
  }
  if (r.rejected.length) log.warn("sync.customers_rejected", { rejected: r.rejected });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
