import { query } from "@/lib/db";
import { getManager } from "@/lib/auth";
import { isManagerRole } from "@/lib/auth-types";

/** Versão do histórico de imagens (só Admin e Gerente). ?f=original devolve o ficheiro ORIGINAL tal como foi carregado. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getManager();
  if (!me || !isManagerRole(me.role)) return new Response("forbidden", { status: 403 });
  const id = (await ctx.params).id;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const want = new URL(req.url).searchParams.get("f") === "original" ? "original" : "optimized";
  const r = await query<{ path: string | null; data: Buffer | null; type: string | null }>(
    `select path, ${want} data, ${want}_type type from menu_item_images where id = $1`, [id]);
  const row = r.rows[0];
  if (!row) return new Response("not found", { status: 404 });
  if (!row.data) return row.path ? Response.redirect(new URL(row.path, req.url), 302) : new Response("not found", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": row.type ?? "application/octet-stream", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" };
  if (want === "original") headers["Content-Disposition"] = `attachment; filename="original-${id.slice(0, 8)}.${(row.type ?? "image/jpeg").split("/")[1].replace("jpeg", "jpg")}"`;
  return new Response(new Uint8Array(row.data), { headers });
}
