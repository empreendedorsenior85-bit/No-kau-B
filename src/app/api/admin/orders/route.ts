import { errInfo, log } from "@/lib/log";
import { getManager } from "@/lib/auth";
import { snapshot, tableHistory } from "@/lib/orders";
import { callsSnapshot } from "@/lib/calls";
import { reservationsSnapshot } from "@/lib/reservations";
import { isManagerRole } from "@/lib/auth-types";


/** Instantâneo dos pedidos (ou histórico de uma mesa). Só para o gerente autenticado. */
export async function GET(req: Request) {
  const me = await getManager();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const table = url.searchParams.get("table");
  try {
    if (table) {
      const id = Number(table);
      if (!Number.isInteger(id)) return Response.json({ error: "bad_request" }, { status: 400 });
      const before = url.searchParams.get("before");
      const orders = await tableHistory(id, before && !Number.isNaN(Date.parse(before)) ? before : null);
      return Response.json({ orders }, { headers: { "Cache-Control": "no-store" } });
    }
    const snap = await snapshot(); // lê o cursor ANTES: o que chegar depois vem pelo stream
    const calls = await callsSnapshot();
    // reservas têm dados pessoais (telefone, email): só para Admin e Gerente
    const reservations = isManagerRole(me.role) ? await reservationsSnapshot() : [];
    return Response.json({ ...snap, calls, reservations }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    log.error("admin.orders_failed", errInfo(e));
    return Response.json({ error: "server" }, { status: 500 });
  }
}
