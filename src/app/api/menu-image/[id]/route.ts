import { query } from "@/lib/db";
import { needsNormalize, normalizeMenuImage } from "@/lib/images";
import { log } from "@/lib/log";
import { archiveBeforeNormalize } from "@/lib/menu-images";

/** Foto de um produto (guardada na base de dados). `?v=` muda quando a foto é substituída. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response("not found", { status: 404 });
  const r = await query<{ image: Buffer; image_type: string }>(
    "select image, image_type from menu_items where id = $1 and active and image is not null", [id]);
  const row = r.rows[0];
  if (!row) return new Response("not found", { status: 404 });
  let { image, image_type: type } = row;
  // fotos guardadas antes da normalização (JPEG/PNG grandes): convertidas uma vez e regravadas (mesma versão)
  if (needsNormalize(type, image.length)) {
    const n = await normalizeMenuImage(image);
    if (n && n.buf.length < image.length) {
      await archiveBeforeNormalize(id, image, type); // o original fica no histórico antes de ser reescrito
      await query("update menu_items set image = $2, image_type = $3 where id = $1 and image = $4", [id, n.buf, n.type, image])
        .catch((e) => log.warn("menu_image.normalize_save_failed", { id, error: (e as Error).message }));
      image = n.buf; type = n.type;
    }
  }
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
