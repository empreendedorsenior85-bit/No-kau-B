import { reservationsByTokens, isResToken } from "@/lib/reservations";
import { rateLimit } from "@/lib/rate-limit";

/** Estado das reservas do cliente (pelos links secretos guardados no telemóvel). Só leitura, sem dados internos. */
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (!rateLimit(`res-poll:${ip}`, 1500, 10 * 60_000)) return Response.json({ error: "rate" }, { status: 429 });
  const tokens = (new URL(req.url).searchParams.get("t") ?? "").split(",").filter(isResToken).slice(0, 20);
  if (!tokens.length) return Response.json({ reservations: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    const list = await reservationsByTokens(tokens);
    return Response.json({ reservations: list }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "server" }, { status: 503 });
  }
}
