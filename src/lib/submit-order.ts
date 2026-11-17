import "server-only";
import { log } from "@/lib/log";
import { orderSchema } from "./validation";
import { placeOrder } from "./orders";
import { rateLimit } from "./rate-limit";
import { isTransient } from "./db";

export type OrderApiBody =
  | { ok: true; orderId: string; number: number; origin: "central" | "local"; duplicate: boolean }
  | { ok: false; message: string; itemIds?: number[]; retry?: boolean };
export type OrderApiResult = { status: number; body: OrderApiBody };

const RATE_CODES = { invalid_table: 404, unavailable: 409, rate_limited: 429, key_conflict: 409, empty: 400 } as const;

/**
 * Cria um pedido. Usado pela rota pública POST /api/pedidos (endereço estável entre publicações)
 * e pela ação de servidor (páginas já abertas de uma versão anterior). Preços, mesa e
 * disponibilidade são decididos aqui; o cliente só envia ids e quantidades.
 */
export async function submitOrder(input: unknown, ip: string | null, customerId: string | null = null): Promise<OrderApiResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { ok: false, message: parsed.error.issues[0]?.message ?? "Pedido inválido." } };

  // Limite alto: no restaurante TODOS os telemóveis saem pelo mesmo IP do Wi-Fi/rede. O controlo fino
  // é por mesa (20 pedidos/10 min, na base de dados); este só trava abuso em massa.
  if (ip && !rateLimit(`order:${ip}`, 1000, 10 * 60_000)) {
    return { status: 429, body: { ok: false, message: "Demasiados pedidos em pouco tempo. Aguarde um momento ou chame um empregado." } };
  }

  const { token, key, lines } = parsed.data;
  try {
    const r = await placeOrder(token, lines, key, customerId);
    if (!r.ok) return { status: RATE_CODES[r.code], body: { ok: false, message: r.message, itemIds: r.itemIds } };
    return { status: 200, body: { ok: true, orderId: r.order.id, number: r.order.number, origin: r.order.origin, duplicate: r.duplicate } };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    log.error("order.save_failed", { code: err.code, error: err.message ?? String(e) });
    // com a MESMA chave o cliente pode repetir sem criar pedidos duplicados
    return {
      status: isTransient(e) ? 503 : 500,
      body: { ok: false, retry: true, message: "O restaurante não conseguiu receber o pedido agora. Vamos tentar de novo — não precisa de repetir." },
    };
  }
}
