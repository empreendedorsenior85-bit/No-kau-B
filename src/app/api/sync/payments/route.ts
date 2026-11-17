import { authorizeSync } from "@/lib/sync/auth";
import { applyPayments, isWirePayment, paymentsChangedAfter } from "@/lib/sync/payments-sync";
import { ensureMigrated } from "@/db/init";

export const maxDuration = 60;

/** Pagamentos alterados no central depois do cursor (rev). */
export async function GET(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return Response.json({ error: "cursor inválido" }, { status: 400 });
  return Response.json(await paymentsChangedAfter(after), { headers: { "Cache-Control": "no-store" } });
}

/** Pagamentos registados no servidor local. Idempotente; conflitos (pagamento duplo) voltam recusados e ficam na Atividade. */
export async function POST(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  if (Number(req.headers.get("content-length") ?? 0) > 1_000_000) return Response.json({ error: "demasiado grande" }, { status: 413 });
  const body = (await req.json().catch(() => null)) as { payments?: unknown[] } | null;
  if (!body || !Array.isArray(body.payments) || body.payments.length > 100) return Response.json({ error: "formato inválido" }, { status: 400 });
  const r = await applyPayments(body.payments.filter(isWirePayment), "servidor-local");
  for (const p of body.payments) {
    if (isWirePayment(p)) continue;
    const id = (p as { id?: unknown })?.id;
    if (typeof id === "string" && id.length <= 64) r.rejected.push({ id, reason: "formato inválido" });
  }
  if (r.rejected.length) console.error("[sync] pagamentos recusados:", JSON.stringify(r.rejected));
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
