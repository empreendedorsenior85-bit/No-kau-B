import "server-only";
import { query, tx } from "@/lib/db";

/**
 * Catálogo que o servidor central envia ao servidor local: menu, mesas (com os mesmos tokens de QR Code)
 * e utilizadores do painel (para o gerente entrar no servidor local com a mesma palavra-passe, mesmo sem internet).
 * As fotografias guardadas na base de dados vão à parte (só as que mudaram), por GET /api/sync/image/[id].
 */
export type WireCatalog = {
  categories: { id: string; label: string; description: string; position: number; active: boolean }[];
  items: {
    id: number; categoryId: string; name: string; description: string; price: number; available: boolean; active: boolean;
    isDemo: boolean; position: number; imageType: string | null; imageVersion: number; imagePath: string | null; reviewNote: string | null;
  }[];
  tables: { id: number; number: number; label: string; qrToken: string; active: boolean; waiterId: string | null }[];
  users: { id: string; email: string; passwordHash: string; role: "admin" | "gerente" | "garcom"; active: boolean; name: string | null }[];
  /** Maior número local (L…) que o central conhece: o servidor local nunca volta a usar um número já usado. */
  maxLocalNumber: number;
};

export async function exportCatalog(): Promise<WireCatalog> {
  const [cats, items, tables, users, maxLocal] = await Promise.all([
    query<WireCatalog["categories"][number]>("select id, label, description, position, active from menu_categories order by position, id"),
    query<WireCatalog["items"][number]>(
      `select id, category_id "categoryId", name, description, price, available, active, is_demo "isDemo", position,
              image_type "imageType", image_version "imageVersion", image_path "imagePath", review_note "reviewNote"
       from menu_items order by id`),
    query<WireCatalog["tables"][number]>(`select id, number, label, qr_token "qrToken", active, waiter_id "waiterId" from dining_tables order by id`),
    query<WireCatalog["users"][number]>(`select id, email, password_hash "passwordHash", role, active, name from admin_users order by created_at`),
    query<{ n: number }>("select coalesce(max(number),0)::int n from orders where origin = 'local'"),
  ]);
  return { categories: cats.rows, items: items.rows, tables: tables.rows, users: users.rows, maxLocalNumber: maxLocal.rows[0].n };
}

/**
 * Aplica o catálogo no servidor local (uma transação: ou tudo, ou nada). O que desapareceu do central fica
 * desativado (nunca apagado: pedidos antigos continuam a apontar para lá). Devolve as fotos a descarregar.
 */
export async function applyCatalog(cat: WireCatalog): Promise<{ imagesToFetch: { id: number; version: number }[] }> {
  return tx(async (c) => {
    for (const k of cat.categories) {
      await c.query(
        `insert into menu_categories (id, label, description, position, active) values ($1,$2,$3,$4,$5)
         on conflict (id) do update set label = excluded.label, description = excluded.description, position = excluded.position, active = excluded.active`,
        [k.id, k.label, k.description, k.position, k.active]);
    }
    await c.query("update menu_categories set active = false where not (id = any($1))", [cat.categories.map((k) => k.id)]);

    const localImg = await c.query<{ id: number; image_version: number; has: boolean }>(
      "select id, image_version, (image is not null) has from menu_items");
    const imgById = new Map(localImg.rows.map((r) => [r.id, r]));
    const imagesToFetch: { id: number; version: number }[] = [];
    for (const i of cat.items) {
      await c.query(
        `insert into menu_items (id, category_id, name, description, price, available, active, is_demo, position, image_path, review_note, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
         on conflict (id) do update set category_id = excluded.category_id, name = excluded.name, description = excluded.description,
           price = excluded.price, available = excluded.available, active = excluded.active, is_demo = excluded.is_demo,
           position = excluded.position, image_path = excluded.image_path, review_note = excluded.review_note, updated_at = now()`,
        [i.id, i.categoryId, i.name, i.description, i.price, i.available, i.active, i.isDemo, i.position, i.imagePath, i.reviewNote]);
      const l = imgById.get(i.id);
      if (i.imageType) {
        if (!l || !l.has || l.image_version !== i.imageVersion) imagesToFetch.push({ id: i.id, version: i.imageVersion });
      } else if (l?.has) {
        await c.query("update menu_items set image = null, image_type = null, image_version = $2 where id = $1", [i.id, i.imageVersion]);
      }
    }
    await c.query("update menu_items set active = false where not (id = any($1))", [cat.items.map((i) => i.id)]);
    await c.query("select setval('menu_items_id_seq', greatest((select coalesce(max(id),0) from menu_items), 1))");

    for (const u of cat.users) {
      // um email reutilizado no central com outra conta: a conta antiga local deixa de o usar
      await c.query("update admin_users set email = email || '#antigo-' || left(id::text, 8), active = false where email = $1 and id <> $2", [u.email, u.id]);
      await c.query(
        `insert into admin_users (id, email, password_hash, role, active, name) values ($1,$2,$3,$4,$5,$6)
         on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash, role = excluded.role, active = excluded.active, name = excluded.name`,
        [u.id, u.email, u.passwordHash, u.role, u.active, u.name ?? null]);
    }
    await c.query("update admin_users set active = false where not (id = any($1::uuid[]))", [cat.users.map((u) => u.id)]);

    // mesas: números únicos — liberta primeiro números que mudaram de mesa (troca de números no central)
    for (const t of cat.tables) {
      // número temporário (positivo, fora do intervalo usado) — o upsert seguinte dá o número certo
      await c.query("update dining_tables set number = 1000000 + id where number = $1 and id <> $2", [t.number, t.id]);
    }
    for (const t of cat.tables) {
      await c.query(
        `insert into dining_tables (id, number, label, qr_token, active, waiter_id) values ($1,$2,$3,$4,$5,$6)
         on conflict (id) do update set number = excluded.number, label = excluded.label, qr_token = excluded.qr_token, active = excluded.active, waiter_id = excluded.waiter_id`,
        [t.id, t.number, t.label, t.qrToken, t.active, t.waiterId ?? null]);
    }
    await c.query("update dining_tables set active = false where not (id = any($1))", [cat.tables.map((t) => t.id)]);
    await c.query("select setval('dining_tables_id_seq', greatest((select coalesce(max(id),0) from dining_tables), 1))");


    // numeração local: continua depois do maior número já usado (aqui ou no central)
    await c.query(
      `select setval('orders_local_number_seq', n) from (select greatest($1::int, (select coalesce(max(number),0) from orders where origin = 'local')) n) x where n > 0`,
      [cat.maxLocalNumber]);
    return { imagesToFetch };
  });
}

export async function saveFetchedImage(id: number, version: number, type: string, buf: Buffer) {
  await query("update menu_items set image = $2, image_type = $3, image_version = $4 where id = $1", [id, buf, type, version]);
}
