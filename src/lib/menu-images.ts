import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { PoolClient } from "pg";
import { query, tx } from "@/lib/db";
import { normalizeMenuImage } from "@/lib/images";
import { log } from "@/lib/log";

/**
 * Gestão central das imagens dos produtos.
 *
 * Regras (nada se perde):
 *  - cada imagem de cada produto é uma linha em `menu_item_images`, com um id único (UUID) e o SHA-256;
 *  - o ORIGINAL carregado fica guardado tal como veio; o menu usa a versão OTIMIZADA (WebP), gerada a partir dele;
 *  - substituir ou remover não apaga: a versão anterior passa a "replaced"/"removed" e pode ser restaurada;
 *  - `menu_items.image` / `image_path` / `image_version` continuam a ser o que o menu, o POS, a rota
 *    /api/menu-image e a sincronização leem — este módulo mantém-nos em sincronia, na mesma transação.
 */
export type ImageSource = "upload" | "static" | "legacy" | "restore";
export type ImageStatus = "current" | "replaced" | "removed";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function retireCurrent(c: PoolClient, itemId: number, by: string, status: "replaced" | "removed") {
  await c.query(
    "update menu_item_images set status = $2, retired_at = now(), retired_by = $3 where item_id = $1 and status = 'current'",
    [itemId, status, by]);
}

/** Foto carregada no painel: guarda o original intacto, gera a otimizada e torna-a a imagem do produto. */
export async function saveUploadedImage(itemId: number, original: Buffer, originalType: string, by: string, c?: PoolClient) {
  const opt = await normalizeMenuImage(original);
  if (!opt) return { ok: false as const, error: "Não foi possível ler a foto. Experimente outra imagem (JPG, PNG ou WebP)." };
  const meta = await sharp(opt.buf).metadata();
  const run = async (cl: PoolClient) => {
    await retireCurrent(cl, itemId, by, "replaced");
    const v = await cl.query<{ image_version: number }>(
      "update menu_items set image = $2, image_type = $3, image_path = null, image_version = image_version + 1, updated_at = now() where id = $1 returning image_version",
      [itemId, opt.buf, opt.type]);
    if (!v.rows[0]) throw new Error("produto inexistente");
    const r = await cl.query<{ id: string }>(
      `insert into menu_item_images (item_id, version, source, original, original_type, original_bytes, original_sha256,
         optimized, optimized_type, optimized_bytes, width, height, sha256, created_by)
       values ($1,$2,'upload',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [itemId, v.rows[0].image_version, original, originalType, original.length, sha(original),
        opt.buf, opt.type, opt.buf.length, meta.width ?? null, meta.height ?? null, sha(opt.buf), by]);
    return r.rows[0].id;
  };
  const id = c ? await run(c) : await tx(run);
  return { ok: true as const, id };
}

/** Imagem ilustrativa (ficheiro do site), ligada pela importação da ementa. */
export async function recordStaticImage(c: PoolClient, itemId: number, path: string, by: string) {
  await retireCurrent(c, itemId, by, "replaced");
  const v = await c.query<{ image_version: number }>("select image_version from menu_items where id = $1", [itemId]);
  await c.query("insert into menu_item_images (item_id, version, source, path, note, created_by) values ($1,$2,'static',$3,'Imagem ilustrativa (ficheiro do site).',$4)",
    [itemId, v.rows[0]?.image_version ?? 0, path, by]);
}

/** Remover a foto do produto: o produto fica sem imagem, mas a versão fica no histórico (restaurável). */
export async function removeImage(itemId: number, by: string) {
  await tx(async (c) => {
    await retireCurrent(c, itemId, by, "removed");
    await c.query("update menu_items set image = null, image_type = null, image_path = null, image_version = image_version + 1, updated_at = now() where id = $1", [itemId]);
  });
}

/** Restaurar uma versão do histórico: passa a ser a imagem atual (como nova versão; a atual fica guardada). */
export async function restoreImage(historyId: string, by: string) {
  return tx(async (c) => {
    const h = await c.query<{ item_id: number; path: string | null; optimized: Buffer | null; optimized_type: string | null; original: Buffer | null; original_type: string | null; original_bytes: number | null; original_sha256: string | null; optimized_bytes: number | null; width: number | null; height: number | null; sha256: string | null }>(
      "select item_id, path, optimized, optimized_type, original, original_type, original_bytes, original_sha256, optimized_bytes, width, height, sha256 from menu_item_images where id = $1", [historyId]);
    const r = h.rows[0];
    if (!r) return { ok: false as const, error: "Versão não encontrada." };
    const exists = await c.query("select 1 from menu_items where id = $1", [r.item_id]);
    if (!exists.rows[0]) return { ok: false as const, error: "O produto já não existe." };
    await retireCurrent(c, r.item_id, by, "replaced");
    const v = await c.query<{ image_version: number }>(
      r.path
        ? "update menu_items set image = null, image_type = null, image_path = $2, image_version = image_version + 1, updated_at = now() where id = $1 returning image_version"
        : "update menu_items set image = $2, image_type = $3, image_path = null, image_version = image_version + 1, updated_at = now() where id = $1 returning image_version",
      r.path ? [r.item_id, r.path] : [r.item_id, r.optimized, r.optimized_type]);
    const n = await c.query<{ id: string }>(
      `insert into menu_item_images (item_id, version, source, path, original, original_type, original_bytes, original_sha256,
         optimized, optimized_type, optimized_bytes, width, height, sha256, restored_from, created_by, note)
       values ($1,$2,'restore',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Restaurada a partir do histórico.') returning id`,
      [r.item_id, v.rows[0].image_version, r.path, r.original, r.original_type, r.original_bytes, r.original_sha256,
        r.optimized, r.optimized_type, r.optimized_bytes, r.width, r.height, r.sha256, historyId, by]);
    return { ok: true as const, id: n.rows[0].id, itemId: r.item_id };
  });
}

/**
 * Fotos antigas grandes, reduzidas na primeira vez que são pedidas (rota /api/menu-image): ANTES de as
 * reescrever, o original é guardado no histórico — já não se perde.
 */
export async function archiveBeforeNormalize(itemId: number, original: Buffer, type: string) {
  await query(
    `update menu_item_images set original = $2, original_type = $3, original_bytes = $4, original_sha256 = $5
     where item_id = $1 and status = 'current' and original is null`,
    [itemId, original, type, original.length, sha(original)]).catch((e) => log.warn("menu_image.archive_failed", { itemId, error: (e as Error).message }));
}

// ---------- verificação e monitorização ----------
export type ImageCheck = { itemId: number; name: string; category: string; source: "upload" | "static"; src: string; ok: boolean; problem?: string };

/**
 * Verifica TODAS as imagens dos produtos ativos:
 *  - fotos guardadas: confirma que os dados são uma imagem válida (descodificável);
 *  - ilustrativas: confirma que o ficheiro existe no site (pedido HEAD ao próprio site).
 * As falhas ficam registadas em image_failures (uma por produto por hora, no máximo).
 */
export async function checkAllImages(origin: string): Promise<ImageCheck[]> {
  const r = await query<{ id: number; name: string; category: string; image: Buffer | null; image_type: string | null; image_path: string | null; image_version: number }>(
    `select i.id, i.name, c.label category, i.image, i.image_type, i.image_path, i.image_version
     from menu_items i join menu_categories c on c.id = i.category_id
     where i.active and (i.image is not null or i.image_path is not null) order by c.position, i.position`);
  const out: ImageCheck[] = [];
  await Promise.all(r.rows.map(async (row) => {
    if (row.image) {
      const src = `/api/menu-image/${row.id}?v=${row.image_version}`;
      try {
        const m = await sharp(row.image).metadata();
        out.push({ itemId: row.id, name: row.name, category: row.category, source: "upload", src, ok: !!m.width && !!m.height });
      } catch (e) {
        out.push({ itemId: row.id, name: row.name, category: row.category, source: "upload", src, ok: false, problem: `dados de imagem inválidos (${(e as Error).message.slice(0, 80)})` });
      }
    } else if (row.image_path) {
      const src = row.image_path;
      try {
        const res = await fetch(new URL(src, origin), { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(8000) });
        const ct = res.headers.get("content-type") ?? "";
        out.push({ itemId: row.id, name: row.name, category: row.category, source: "static", src, ok: res.ok && ct.startsWith("image/"), problem: res.ok ? (ct.startsWith("image/") ? undefined : `não é uma imagem (${ct})`) : `ficheiro indisponível (HTTP ${res.status})` });
      } catch (e) {
        out.push({ itemId: row.id, name: row.name, category: row.category, source: "static", src, ok: false, problem: `sem resposta (${(e as Error).message.slice(0, 60)})` });
      }
    }
  }));
  for (const f of out.filter((x) => !x.ok)) await recordFailure(f.itemId, f.src, "server_check", f.problem ?? "");
  if (out.some((x) => !x.ok)) log.warn("menu_image.check_failed", { failed: out.filter((x) => !x.ok).map((x) => ({ id: x.itemId, src: x.src, problem: x.problem })) });
  return out.sort((a, b) => Number(a.ok) - Number(b.ok));
}

/** Regista uma falha (no máximo uma por produto e tipo por hora; a tabela guarda 60 dias). */
export async function recordFailure(itemId: number | null, src: string, kind: "client_load" | "server_check", detail: string) {
  const recent = await query("select 1 from image_failures where coalesce(item_id,-1) = coalesce($1,-1) and kind = $2 and created_at > now() - interval '1 hour' limit 1", [itemId, kind]);
  if (recent.rows[0]) return false;
  await query("insert into image_failures (item_id, src, kind, detail) values ($1,$2,$3,$4)", [itemId, src.slice(0, 300), kind, detail.slice(0, 300)]);
  await query("delete from image_failures where created_at < now() - interval '60 days'");
  return true;
}
