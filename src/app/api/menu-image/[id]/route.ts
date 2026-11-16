import { query } from "@/lib/db";


/** Foto de um produto (guardada na base de dados). `?v=` muda quando a foto é substituída. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response("not found", { status: 404 });
  const r = await query<{ image: Buffer; image_type: string }>(
    "select image, image_type from menu_items where id = $1 and active and image is not null", [id]);
  const row = r.rows[0];
  if (!row) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(row.image), {
    headers: { "Content-Type": row.image_type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
