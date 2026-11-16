import { getManager } from "@/lib/auth";
import { snapshot, tableHistory } from "@/lib/orders";


/** Instantâneo dos pedidos (ou histórico de uma mesa). Só para o gerente autenticado. */
export async function GET(req: Request) {
  if (!(await getManager())) return Response.json({ error: "unauthorized" }, { status: 401 });
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
    return Response.json(await snapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[orders]", e);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
