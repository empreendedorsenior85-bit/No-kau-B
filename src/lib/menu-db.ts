import "server-only";
import { query } from "./db";
import { ensureMigrated } from "@/db/init";

export type DbMenuItem = {
  id: number; categoryId: string; name: string; description: string; price: number;
  available: boolean; isDemo: boolean; imageUrl: string | null; reviewNote: string | null;
};
export type DbMenuCategory = { id: string; label: string; description: string; items: DbMenuItem[] };

type ItemRow = {
  id: number; category_id: string; name: string; description: string; price: number; available: boolean;
  is_demo: boolean; has_image: boolean; image_version: number; image_path: string | null; review_note: string | null;
};

export const imageUrl = (id: number, v: number) => `/api/menu-image/${id}?v=${v}`;

const toItem = (r: ItemRow): DbMenuItem => ({
  id: r.id, categoryId: r.category_id, name: r.name, description: r.description, price: r.price,
  available: r.available, isDemo: r.is_demo, reviewNote: r.review_note,
  // fotografia por ficheiro tem prioridade; senão a guardada na base de dados
  imageUrl: r.image_path ?? (r.has_image ? imageUrl(r.id, r.image_version) : null),
});

const ITEM_COLS = `i.id, i.category_id, i.name, i.description, i.price, i.available, i.is_demo,
                   (i.image is not null) as has_image, i.image_version, i.image_path, i.review_note`;

/** Menu para clientes: só categorias e produtos ativos (indisponíveis aparecem, mas não se podem pedir). */
export async function getPublicMenu(): Promise<DbMenuCategory[]> {
  await ensureMigrated();
  const cats = await query<{ id: string; label: string; description: string }>(
    "select id, label, description from menu_categories where active order by position");
  const items = await query<ItemRow>(
    `select ${ITEM_COLS} from menu_items i join menu_categories c on c.id = i.category_id
     where i.active and c.active order by i.position, i.id`);
  return cats.rows
    .map((c) => ({ ...c, items: items.rows.filter((i) => i.category_id === c.id).map(toItem) }))
    .filter((c) => c.items.length > 0);
}

/** Menu para o gerente: inclui produtos desativados. */
export async function getAdminMenu(): Promise<(DbMenuCategory & { active: boolean; itemsAll: (DbMenuItem & { active: boolean })[] })[]> {
  await ensureMigrated();
  const cats = await query<{ id: string; label: string; description: string; active: boolean }>(
    "select id, label, description, active from menu_categories order by position, id");
  const items = await query<ItemRow & { active: boolean }>(
    `select ${ITEM_COLS}, i.active from menu_items i order by i.position, i.id`);
  return cats.rows.map((c) => {
    const all = items.rows.filter((i) => i.category_id === c.id).map((r) => ({ ...toItem(r), active: r.active }));
    return { ...c, items: all, itemsAll: all };
  });
}

export async function getTableByToken(token: string): Promise<{ id: number; number: number; label: string } | null> {
  const r = await query<{ id: number; number: number; label: string }>(
    "select id, number, label from dining_tables where qr_token = $1 and active", [token]);
  return r.rows[0] ?? null;
}
