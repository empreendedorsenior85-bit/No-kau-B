import { authorizeSync } from "@/lib/sync/auth";
import { query } from "@/lib/db";

/** Fotografia guardada na base de dados (para o servidor local a ter sem internet). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id)) return new Response("bad id", { status: 400 });
  const r = await query<{ image: Buffer | null; image_type: string | null; image_version: number }>(
    "select image, image_type, image_version from menu_items where id = $1", [id]);
  const row = r.rows[0];
  if (!row?.image || !row.image_type) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(row.image), {
    headers: { "Content-Type": row.image_type, "X-Image-Version": String(row.image_version), "Cache-Control": "no-store" },
  });
}
