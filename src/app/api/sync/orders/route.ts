import { authorizeSync } from "@/lib/sync/auth";
import { applyOrders, isWireOrder, ordersChangedAfter } from "@/lib/sync/orders-sync";
import { ensureMigrated } from "@/db/init";

export const maxDuration = 60;

/** Pedidos alterados no central depois do cursor (rev). */
export async function GET(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return Response.json({ error: "cursor inválido" }, { status: 400 });
  return Response.json(await ordersChangedAfter(after), { headers: { "Cache-Control": "no-store" } });
}

/** Pedidos (novos ou com estado alterado) enviados pelo servidor local. Idempotente. */
export async function POST(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  if (Number(req.headers.get("content-length") ?? 0) > 2_000_000) return Response.json({ error: "demasiado grande" }, { status: 413 });
  const body = (await req.json().catch(() => null)) as { orders?: unknown[] } | null;
  if (!body || !Array.isArray(body.orders) || body.orders.length > 100) return Response.json({ error: "formato inválido" }, { status: 400 });
  const valid = body.orders.filter(isWireOrder);
  const invalid = body.orders.length - valid.length;
  const r = await applyOrders(valid, "servidor-local");
  // os inválidos voltam como RECUSADOS (com o id): o servidor local deixa de os reenviar.
  // Sem isto, um pedido inválido ficava na fila para sempre e podia bloquear os seguintes.
  for (const o of body.orders) {
    if (isWireOrder(o)) continue;
    const id = (o as { id?: unknown })?.id;
    if (typeof id === "string" && id.length <= 64) r.rejected.push({ id, reason: "formato inválido (pedido sem produtos ou dados em falta)" });
  }
  if (invalid) console.error(`[sync] ${invalid} pedido(s) com formato inválido recusado(s)`);
  if (r.rejected.length) console.error("[sync] pedidos recusados:", JSON.stringify(r.rejected));
  return Response.json({ ...r, invalid }, { headers: { "Cache-Control": "no-store" } });
}
