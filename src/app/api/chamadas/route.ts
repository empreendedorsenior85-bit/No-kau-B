import { errInfo, log } from "@/lib/log";
import { z } from "zod";
import { CALL_KINDS, callsForTable, createCall, publicView } from "@/lib/calls";
import { isQrToken } from "@/lib/tokens";
import { rateLimit, rateLimitShared } from "@/lib/rate-limit";
import { isTransient } from "@/lib/db";

const schema = z.object({
  token: z.string().refine(isQrToken, "QR Code inválido. Leia o QR Code da mesa outra vez."),
  kind: z.enum(CALL_KINDS as [string, ...string[]], { message: "Tipo de chamada inválido." }),
  key: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Pedido inválido. Atualize a página."),
});
const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "?";

/** O cliente chama o empregado, o gerente ou pede a conta (a partir do menu da mesa). */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 5_000) return Response.json({ ok: false, message: "Pedido inválido." }, { status: 413 });
  // limite alto: todos os telemóveis do restaurante saem pelo mesmo IP do Wi-Fi; o controlo fino é por mesa
  if (!(await rateLimitShared(`call:${ipOf(req)}`, 600, 10 * 60_000))) return Response.json({ ok: false, message: "Demasiados pedidos. Aguarde um momento." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 });
  try {
    const r = await createCall(parsed.data.token, parsed.data.kind as "waiter" | "manager" | "bill", parsed.data.key);
    if (!r.ok) return Response.json({ ok: false, message: r.message }, { status: r.code === "invalid_table" ? 404 : 429 });
    return Response.json({ ok: true, call: publicView(r.call), duplicate: r.duplicate }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    log.error("call.create_failed", errInfo(e));
    return Response.json({ ok: false, retry: true, message: "Não foi possível chamar agora. Tente de novo ou faça sinal a um empregado." }, { status: isTransient(e) ? 503 : 500 });
  }
}

/** Estado das chamadas da mesa (o cliente acompanha "a caminho"). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!isQrToken(token)) return Response.json({ error: "not_found" }, { status: 404 });
  if (!rateLimit(`callpoll:${ipOf(req)}`, 2000, 10 * 60_000)) return Response.json({ error: "rate" }, { status: 429 });
  try {
    return Response.json({ calls: (await callsForTable(token)).map(publicView) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "server" }, { status: 503 });
  }
}
