"use server";

import { headers } from "next/headers";
import { submitOrder, type OrderApiBody } from "@/lib/submit-order";
import { getCustomer } from "@/lib/customers";
import { getManager } from "@/lib/auth";

export type PlaceOrderResponse = OrderApiBody;

/** Ação de servidor (mantida para páginas já abertas). O envio normal usa POST /api/pedidos. */
export async function placeOrderAction(input: unknown): Promise<PlaceOrderResponse> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  const customer = await getCustomer().catch(() => null);
  const staff = customer ? null : await getManager().catch(() => null);
  return (await submitOrder(input, ip, { customerId: customer?.id ?? null, staff: !!staff })).body;
}
