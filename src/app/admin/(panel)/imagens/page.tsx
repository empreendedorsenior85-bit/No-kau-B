import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/db/init";
import { imageUrl } from "@/lib/menu-db";
import { ImagesManager, type ImgItem, type ImgVersion, type ImgFailure } from "@/components/admin/ImagesManager";
import { LocalReadOnly } from "@/components/admin/LocalReadOnly";

export const metadata: Metadata = { title: "Imagens" };

export default async function Page() {
  await requireManager();
  await ensureMigrated();
  const items = await query<{ id: number; name: string; price: number; category: string; cat_pos: number; pos: number; has_image: boolean; image_path: string | null; image_version: number; image_bytes: number | null }>(
    `select i.id, i.name, i.price, c.label category, c.position cat_pos, i.position pos, (i.image is not null) has_image, i.image_path, i.image_version, length(i.image) image_bytes
     from menu_items i join menu_categories c on c.id = i.category_id where i.active and c.active order by c.position, i.position, i.id`);
  const hist = await query<{ id: string; item_id: number; version: number; source: string; status: string; path: string | null; has_original: boolean; original_bytes: number | null; original_type: string | null; optimized_bytes: number | null; width: number | null; height: number | null; sha256: string | null; created_by: string | null; created_at: string; retired_at: string | null; note: string | null }>(
    `select id, item_id, version, source, status, path, (original is not null) has_original, original_bytes, original_type, optimized_bytes, width, height, sha256, created_by, created_at, retired_at, note
     from menu_item_images order by created_at desc`);
  const fails = await query<{ id: string; item_id: number | null; src: string; kind: string; detail: string | null; created_at: string; name: string | null }>(
    `select f.id::text, f.item_id, f.src, f.kind, f.detail, f.created_at, i.name from image_failures f left join menu_items i on i.id = f.item_id
     where f.created_at > now() - interval '7 days' order by f.created_at desc limit 100`);
  const byItem = new Map<number, ImgVersion[]>();
  for (const h of hist.rows) {
    const v: ImgVersion = { id: h.id, version: h.version, source: h.source, status: h.status, path: h.path, hasOriginal: h.has_original, originalBytes: h.original_bytes, originalType: h.original_type, optimizedBytes: h.optimized_bytes, width: h.width, height: h.height, sha: h.sha256?.slice(0, 12) ?? null, by: h.created_by, at: new Date(h.created_at).toISOString(), retiredAt: h.retired_at ? new Date(h.retired_at).toISOString() : null, note: h.note };
    (byItem.get(h.item_id) ?? byItem.set(h.item_id, []).get(h.item_id)!).push(v);
  }
  const data: ImgItem[] = items.rows.map((r) => ({
    id: r.id, name: r.name, price: r.price, category: r.category,
    source: r.has_image ? "upload" : r.image_path ? (r.image_path.startsWith("/menu/ilustrativas/") ? "illustrative" : "static") : "none",
    src: r.has_image ? imageUrl(r.id, r.image_version) : r.image_path, bytes: r.image_bytes, version: r.image_version,
    history: byItem.get(r.id) ?? [],
  }));
  const failures: ImgFailure[] = fails.rows.map((f) => ({ id: f.id, itemId: f.item_id, name: f.name, src: f.src, kind: f.kind, detail: f.detail, at: new Date(f.created_at).toISOString() }));
  return (
    <>
      <h1 className="mb-2 font-display text-3xl text-white">Imagens</h1>
      <p className="mb-8 max-w-3xl text-sm text-mist">
        Todas as imagens dos produtos num só lugar: o que cada produto mostra, o histórico de versões (nada se perde ao substituir ou remover),
        o original guardado e as falhas detetadas. Para carregar ou trocar uma foto, use a página <a href="/admin/menu" className="text-gold-300 underline underline-offset-4">Menu</a>.
      </p>
      <LocalReadOnly what="as imagens"><ImagesManager items={data} failures={failures} /></LocalReadOnly>
    </>
  );
}
