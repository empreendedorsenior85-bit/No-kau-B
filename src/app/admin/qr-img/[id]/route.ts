import QRCode from "qrcode";
import { getManager } from "@/lib/auth";
import { isManagerRole } from "@/lib/auth-types";
import { query } from "@/lib/db";
import { originFrom } from "@/lib/origin";


/** QR Code de uma mesa em PNG ou SVG (descarregável). Só para o gerente. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const m = await getManager();
  if (!m) return new Response("unauthorized", { status: 401 });
  if (!isManagerRole(m.role)) return new Response("forbidden", { status: 403 }); // Garçom: sem acesso
  const id = Number((await ctx.params).id);
  const url = new URL(req.url);
  const r = await query<{ number: number; label: string; qr_token: string }>(
    "select number, label, qr_token from dining_tables where id = $1", [Number.isInteger(id) ? id : -1]);
  const t = r.rows[0];
  if (!t) return new Response("not found", { status: 404 });

  const origin = originFrom(req.headers);
  const target = `${origin}/m/${t.qr_token}`;
  const fmt = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const name = `nokau-mesa-${t.number}.${fmt}`;
  const disposition = url.searchParams.get("download") ? `attachment; filename="${name}"` : "inline";
  const headers = { "Content-Disposition": disposition, "Cache-Control": "no-store" };

  if (fmt === "svg") {
    const svg = await QRCode.toString(target, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
    return new Response(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
  const png = await QRCode.toBuffer(target, { type: "png", width: 1200, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
}
