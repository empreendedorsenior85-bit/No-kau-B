import "server-only";

/**
 * Entrega de pedidos (reservas / eventos) ao restaurante.
 *
 * Fase 3: não existe backend configurado → `deliver` devolve "not_configured" e a interface
 * oferece ao cliente o envio por SMS/chamada com a mensagem já preenchida.
 * Fase 4: implementar aqui a gravação em Supabase + notificação ao painel.
 * Nunca afirmar ao cliente que o pedido chegou se não chegou.
 */
export type DeliveryResult = { status: "delivered"; reference: string } | { status: "not_configured" };

export async function deliver(kind: "reservation" | "private_event", payload: Record<string, unknown>): Promise<DeliveryResult> {
  void kind;
  void payload;
  if (!process.env.NOKAU_BACKEND_URL) return { status: "not_configured" };
  // Fase 4 — integração real.
  return { status: "not_configured" };
}
