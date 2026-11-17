import { errInfo, log } from "@/lib/log";
import { getOrderForTable } from "@/lib/orders";
import { isQrToken } from "@/lib/tokens";
import { rateLimit } from "@/lib/rate-limit";


/** Estado do pedido para o cliente. Exige o id (aleatório) E o token da mesa. Só leitura. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip && !rateLimit(`poll:${ip}`, 300, 10 * 60_000)) return Response.json({ error: "rate" }, { status: 429 });
  if (!isQrToken(token)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const o = await getOrderForTable(id, token);
    if (!o) return Response.json({ error: "not_found" }, { status: 404 });
    // dados mínimos: nada de ids internos nem de outras mesas
    return Response.json(
      { number: o.number, origin: o.origin, tableLabel: o.tableLabel, status: o.status, total: o.total, createdAt: o.createdAt, items: o.items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    log.error("order.status_failed", errInfo(e));
    return Response.json({ error: "server" }, { status: 500 });
  }
}
