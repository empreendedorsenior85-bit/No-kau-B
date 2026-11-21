"use server";
import { updateTag } from "next/cache";
import { getManager } from "@/lib/auth";
import { isManagerRole } from "@/lib/auth-types";
import { isLocalServer } from "@/lib/node-role";
import { query } from "@/lib/db";
import { countStock, moveStock, trackItem, untrackItem, updateStockSettings, type StockResult } from "@/lib/stock";

/**
 * Ações do stock — só Admin e Gerente, e só no servidor central (o servidor local não guarda o stock;
 * os pedidos concluídos lá são descontados quando chegam ao central).
 */
async function manager() {
  const m = await getManager();
  if (!m || !isManagerRole(m.role)) throw new Error("Não autorizado");
  return m;
}
const LOCAL = "O stock gere-se no site central. Os pedidos concluídos aqui são descontados quando chegarem ao central.";
const who = (m: { name?: string | null; email: string }) => m.name || m.email;
const int = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

async function done(r: StockResult, actor: string, action: string, detail: unknown): Promise<StockResult> {
  if (r.ok) {
    await query("insert into audit_log (actor, action, entity, entity_id, detail) values ($1,$2,'stock',$3,$4)",
      [actor, action, String(r.level.menuItemId), JSON.stringify(detail)]);
    updateTag("menu"); // o esgotado automático pode ter mudado a disponibilidade no menu público
  }
  return r;
}

export async function trackStockAction(input: { itemId: number; initial: unknown; min: unknown; autoSoldout: boolean }): Promise<StockResult> {
  const m = await manager();
  if (isLocalServer()) return { ok: false, message: LOCAL };
  const r = await trackItem(input.itemId, int(input.initial), int(input.min), !!input.autoSoldout, who(m));
  return done(r, m.email, "stock.track", { initial: input.initial, min: input.min, autoSoldout: !!input.autoSoldout });
}

export async function moveStockAction(input: { itemId: number; kind: "entrada" | "saida"; qty: unknown; reason?: string | null }): Promise<StockResult> {
  const m = await manager();
  if (isLocalServer()) return { ok: false, message: LOCAL };
  if (input.kind !== "entrada" && input.kind !== "saida") return { ok: false, message: "Movimento inválido." };
  const r = await moveStock(input.itemId, input.kind, int(input.qty), input.reason ?? null, who(m));
  return done(r, m.email, `stock.${input.kind}`, { qty: input.qty, reason: input.reason ?? null });
}

export async function countStockAction(input: { itemId: number; counted: unknown; reason?: string | null }): Promise<StockResult> {
  const m = await manager();
  if (isLocalServer()) return { ok: false, message: LOCAL };
  const r = await countStock(input.itemId, int(input.counted), input.reason ?? null, who(m));
  return done(r, m.email, "stock.count", { counted: input.counted, reason: input.reason ?? null });
}

export async function stockSettingsAction(input: { itemId: number; min: unknown; autoSoldout: boolean }): Promise<StockResult> {
  const m = await manager();
  if (isLocalServer()) return { ok: false, message: LOCAL };
  const r = await updateStockSettings(input.itemId, int(input.min), !!input.autoSoldout, who(m));
  return done(r, m.email, "stock.settings", { min: input.min, autoSoldout: !!input.autoSoldout });
}

export async function untrackStockAction(itemId: number): Promise<{ ok: boolean; message?: string }> {
  const m = await manager();
  if (isLocalServer()) return { ok: false, message: LOCAL };
  if (!Number.isInteger(itemId)) return { ok: false, message: "Produto inválido." };
  if (!(await untrackItem(itemId))) return { ok: false, message: "Este produto não tem stock registado." };
  await query("insert into audit_log (actor, action, entity, entity_id) values ($1,'stock.untrack','stock',$2)", [m.email, String(itemId)]);
  updateTag("menu");
  return { ok: true };
}
