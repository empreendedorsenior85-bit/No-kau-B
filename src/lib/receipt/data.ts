import "server-only";
import { query } from "@/lib/db";
import type { Receipt } from "@/lib/payments";
import { formatOrderNumber, formatReceiptNumber } from "@/lib/types";
import type { ReceiptData } from "./doc";

/**
 * Dados do recibo a partir do pagamento REAL (nunca valores inventados).
 * `onlyCustomer`: na conta do cliente, os pedidos de outras pessoas da mesma conta aparecem só como total.
 */
export async function receiptData(r: Receipt, onlyCustomer?: string): Promise<ReceiptData> {
  const p = r.payment;
  const owner = onlyCustomer ?? r.orders.find((o) => o.customerId)?.customerId ?? null;
  const cust = owner ? (await query<{ name: string; phone: string }>("select name, phone from customers where id = $1", [owner])).rows[0] ?? null : null;
  return {
    receiptNumber: formatReceiptNumber(p.receiptNumber, p.origin),
    createdAt: p.createdAt,
    tableLabel: p.tableLabel,
    staff: p.receivedBy,
    customer: cust,
    status: p.status,
    voided: p.status === "voided" ? { at: p.voidedAt, by: p.voidedBy, reason: p.voidReason } : undefined,
    orders: r.orders.map((o) => ({
      number: formatOrderNumber(o.number, o.origin),
      total: o.total,
      items: onlyCustomer && o.customerId !== onlyCustomer ? null : o.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
    })),
    total: p.amount,
    method: p.method,
    tendered: p.tendered,
    change: p.change,
    note: p.note,
    printedAt: new Date().toISOString(),
  };
}
