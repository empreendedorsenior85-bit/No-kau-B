import { cancelCall, publicView } from "@/lib/calls";
import { isQrToken } from "@/lib/tokens";

/** O cliente cancela uma chamada que ainda ninguém atendeu. Exige o token da mesa. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!isQrToken(token)) return Response.json({ ok: false }, { status: 404 });
  try {
    const c = await cancelCall(token, id);
    if (!c) return Response.json({ ok: false }, { status: 404 });
    return Response.json({ ok: true, call: publicView(c) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
