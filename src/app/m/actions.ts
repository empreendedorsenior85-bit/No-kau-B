"use server";

import { headers } from "next/headers";
import { submitOrder, type OrderApiBody } from "@/lib/submit-order";
import { getCustomer } from "@/lib/customers";

export type PlaceOrderResponse = OrderApiBody;

/** Ação de servidor (mantida para páginas já abertas). O envio normal usa POST /api/pedidos. */
export async function placeOrderAction(input: unknown): Promise<PlaceOrderResponse> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  const customer = await getCustomer().catch(() => null);
  return (await submitOrder(input, ip, customer?.id ?? null)).body;
}
