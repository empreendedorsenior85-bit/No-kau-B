import "server-only";
import { query, tx } from "./db";
import { ensureMigrated } from "@/db/init";

/**
 * Gestão de stock por produto do menu (1 vendido = 1 a menos).
 * Toda a mudança de quantidade passa pela função stock_move() da base de dados (quantidade + movimento imutável
 * + esgotado automático numa só operação). As vendas são descontadas pela própria base de dados quando o pedido
 * fica CONCLUÍDO (ver MIGRATE_STOCK_SQL) — o código da aplicação nunca desconta vendas à mão.
 */
export type StockStatus = "out" | "low" | "ok";
export type StockLevel = {
  menuItemId: number; name: string; category: string; price: number; available: boolean;
  quantity: number; minQuantity: number; autoSoldout: boolean; soldoutByStock: boolean;
  status: StockStatus; updatedAt: string; updatedBy: string | null; rev: number;
};
export type StockMovementKind = "inicial" | "entrada" | "saida" | "ajuste" | "venda" | "estorno";
export type StockMovement = {
  id: number; menuItemId: number; name: string; kind: StockMovementKind; delta: number; quantityAfter: number;
  reason: string | null; orderId: string | null; actor: string; createdAt: string;
};
export const MOVEMENT_LABEL: Record<StockMovementKind, string> = {
  inicial: "Registo inicial", entrada: "Entrada", saida: "Saída", ajuste: "Contagem (ajuste)", venda: "Venda", estorno: "Venda revertida",
};
export const STOCK_MAX = 100_000;

export const stockStatus = (quantity: number, min: number): StockStatus => (quantity <= 0 ? "out" : quantity <= min ? "low" : "ok");

type LevelRow = {
  menu_item_id: number; name: string; category: string; price: number; available: boolean; quantity: number; min_quantity: number;
  auto_soldout: boolean; soldout_by_stock: boolean; updated_at: Date; updated_by: string | null; rev: string;
};
const LEVEL_SELECT = `
  select s.menu_item_id, m.name, c.label category, m.price, m.available, s.quantity, s.min_quantity, s.auto_soldout, s.soldout_by_stock,
         s.updated_at, s.updated_by, s.rev
  from stock_levels s join menu_items m on m.id = s.menu_item_id join menu_categories c on c.id = m.category_id`;
const toLevel = (r: LevelRow): StockLevel => ({
  menuItemId: r.menu_item_id, name: r.name, category: r.category, price: r.price, available: r.available,
  quantity: r.quantity, minQuantity: r.min_quantity, autoSoldout: r.auto_soldout, soldoutByStock: r.soldout_by_stock,
  status: stockStatus(r.quantity, r.min_quantity), updatedAt: r.updated_at.toISOString(), updatedBy: r.updated_by, rev: Number(r.rev),
});
/** Ordem: esgotados, a acabar, depois por nome. */
const ORDER = `order by case when s.quantity <= 0 then 0 when s.quantity <= s.min_quantity then 1 else 2 end, m.name`;

export async function listStock(): Promise<StockLevel[]> {
  await ensureMigrated();
  const r = await query<LevelRow>(`${LEVEL_SELECT} where m.active ${ORDER}`);
  return r.rows.map(toLevel);
}

/** Para o tempo real: níveis alterados depois de `rev` (mesma sequência dos pedidos). */
export async function stockChangedSince(rev: number): Promise<StockLevel[]> {
  const r = await query<LevelRow>(`${LEVEL_SELECT} where s.rev > $1 order by s.rev limit 500`, [rev]);
  return r.rows.map(toLevel);
}

/** Produtos ativos do menu ainda sem controlo de stock (para "Registar produto"). */
export async function untrackedItems(): Promise<{ id: number; name: string; category: string }[]> {
  await ensureMigrated();
  const r = await query<{ id: number; name: string; category: string }>(
    `select m.id, m.name, c.label category from menu_items m join menu_categories c on c.id = m.category_id
     where m.active and not m.is_demo and not exists (select 1 from stock_levels s where s.menu_item_id = m.id)
     order by c.position, m.position, m.name`);
  return r.rows;
}

export async function listMovements(opts: { itemId?: number | null; kind?: StockMovementKind | null; from?: Date; to?: Date; limit?: number } = {}): Promise<StockMovement[]> {
  await ensureMigrated();
  const r = await query<{ id: string; menu_item_id: number; name: string; kind: StockMovementKind; delta: number; quantity_after: number; reason: string | null; order_id: string | null; actor: string; created_at: Date }>(
    `select x.id, x.menu_item_id, m.name, x.kind, x.delta, x.quantity_after, x.reason, x.order_id, x.actor, x.created_at
     from stock_movements x join menu_items m on m.id = x.menu_item_id
     where ($1::int is null or x.menu_item_id = $1) and ($2::text is null or x.kind = $2)
       and ($3::timestamptz is null or x.created_at >= $3) and ($4::timestamptz is null or x.created_at < $4)
     order by x.id desc limit $5`,
    [opts.itemId ?? null, opts.kind ?? null, opts.from ?? null, opts.to ?? null, Math.min(opts.limit ?? 200, 2000)]);
  return r.rows.map((x) => ({
    id: Number(x.id), menuItemId: x.menu_item_id, name: x.name, kind: x.kind, delta: x.delta, quantityAfter: x.quantity_after,
    reason: x.reason, orderId: x.order_id, actor: x.actor, createdAt: x.created_at.toISOString(),
  }));
}

export type StockResult = { ok: true; level: StockLevel } | { ok: false; message: string };

async function levelOf(itemId: number): Promise<StockLevel | null> {
  const r = await query<LevelRow>(`${LEVEL_SELECT} where s.menu_item_id = $1`, [itemId]);
  return r.rows[0] ? toLevel(r.rows[0]) : null;
}
const validQty = (n: number, min = 0) => Number.isInteger(n) && n >= min && n <= STOCK_MAX;
const cleanReason = (s: string | null | undefined) => { const t = (s ?? "").trim().replace(/\s+/g, " "); return t ? t.slice(0, 200) : null; };

/** Começar a controlar o stock de um produto do menu (com a contagem inicial). */
export async function trackItem(itemId: number, initial: number, min: number, autoSoldout: boolean, actor: string): Promise<StockResult> {
  if (!Number.isInteger(itemId)) return { ok: false, message: "Produto inválido." };
  if (!validQty(initial)) return { ok: false, message: `Quantidade inicial entre 0 e ${STOCK_MAX}.` };
  if (!validQty(min)) return { ok: false, message: `Stock mínimo entre 0 e ${STOCK_MAX}.` };
  await ensureMigrated();
  const done = await tx(async (c) => {
    const m = await c.query("select 1 from menu_items where id = $1 and active and not is_demo", [itemId]);
    if (!m.rows[0]) return "Produto não encontrado no menu.";
    const ins = await c.query("insert into stock_levels (menu_item_id, quantity, min_quantity, auto_soldout, updated_by) values ($1, 0, $2, $3, $4) on conflict do nothing returning 1",
      [itemId, min, autoSoldout, actor]);
    if (!ins.rows[0]) return "Este produto já tem stock registado.";
    await c.query("select stock_move($1, $2, 'inicial', 'Contagem inicial', null, $3)", [itemId, initial, actor]);
    return null;
  });
  if (done) return { ok: false, message: done };
  return { ok: true, level: (await levelOf(itemId))! };
}

/** Entrada (compra/reposição) ou saída manual (quebra, validade, consumo interno…). A saída exige motivo. */
export async function moveStock(itemId: number, kind: "entrada" | "saida", qty: number, reasonRaw: string | null, actor: string): Promise<StockResult> {
  if (!validQty(qty, 1)) return { ok: false, message: `Quantidade entre 1 e ${STOCK_MAX}.` };
  const reason = cleanReason(reasonRaw);
  if (kind === "saida" && !reason) return { ok: false, message: "Indique o motivo da saída (ex.: quebra, validade, consumo interno)." };
  await ensureMigrated();
  const err = await tx(async (c) => {
    const l = await c.query<{ quantity: number }>("select quantity from stock_levels where menu_item_id = $1 for update", [itemId]);
    if (!l.rows[0]) return "Este produto não tem stock registado.";
    const after = l.rows[0].quantity + (kind === "entrada" ? qty : -qty);
    if (after > STOCK_MAX) return `O stock não pode passar de ${STOCK_MAX}.`;
    if (kind === "saida" && after < 0) return `Só há ${l.rows[0].quantity} em stock: não é possível tirar ${qty}. Se a contagem real é diferente, use "Contagem".`;
    await c.query("select stock_move($1, $2, $3, $4, null, $5)", [itemId, kind === "entrada" ? qty : -qty, kind, reason, actor]);
    return null;
  });
  if (err) return { ok: false, message: err };
  return { ok: true, level: (await levelOf(itemId))! };
}

/** Contagem física: acerta o stock para a quantidade contada (regista a diferença). Exige motivo. */
export async function countStock(itemId: number, counted: number, reasonRaw: string | null, actor: string): Promise<StockResult> {
  if (!validQty(counted)) return { ok: false, message: `Quantidade contada entre 0 e ${STOCK_MAX}.` };
  const reason = cleanReason(reasonRaw) ?? "Contagem física";
  await ensureMigrated();
  const err = await tx(async (c) => {
    const l = await c.query<{ quantity: number }>("select quantity from stock_levels where menu_item_id = $1 for update", [itemId]);
    if (!l.rows[0]) return "Este produto não tem stock registado.";
    const delta = counted - l.rows[0].quantity;
    if (delta === 0) return "A quantidade contada é igual à do sistema — nada a acertar.";
    await c.query("select stock_move($1, $2, 'ajuste', $3, null, $4)", [itemId, delta, reason, actor]);
    return null;
  });
  if (err) return { ok: false, message: err };
  return { ok: true, level: (await levelOf(itemId))! };
}

/** Stock mínimo e esgotado automático. */
export async function updateStockSettings(itemId: number, min: number, autoSoldout: boolean, actor: string): Promise<StockResult> {
  if (!validQty(min)) return { ok: false, message: `Stock mínimo entre 0 e ${STOCK_MAX}.` };
  await ensureMigrated();
  const found = await tx(async (c) => {
    const r = await c.query("update stock_levels set min_quantity = $2, auto_soldout = $3, updated_by = $4 where menu_item_id = $1 returning 1", [itemId, min, autoSoldout, actor]);
    if (!r.rows[0]) return false;
    await c.query("select stock_sync_availability($1)", [itemId]);
    return true;
  });
  if (!found) return { ok: false, message: "Este produto não tem stock registado." };
  return { ok: true, level: (await levelOf(itemId))! };
}

/** Deixar de controlar o stock. O histórico fica; se foi o stock que o esgotou, o produto volta ao menu. */
export async function untrackItem(itemId: number): Promise<boolean> {
  await ensureMigrated();
  return tx(async (c) => {
    const l = await c.query<{ soldout_by_stock: boolean }>("delete from stock_levels where menu_item_id = $1 returning soldout_by_stock", [itemId]);
    if (!l.rows[0]) return false;
    if (l.rows[0].soldout_by_stock) await c.query("update menu_items set available = true, updated_at = now() where id = $1", [itemId]);
    return true;
  });
}
