import type { Receipt } from "@/lib/payments";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL, formatOrderNumber, formatReceiptNumber } from "@/lib/types";
import { site } from "@/lib/site";
import { PrintButton } from "./PrintButton";

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

/**
 * Recibo de um pagamento (comprovativo interno do restaurante). No ecrã segue o tema escuro; ao imprimir sai a preto
 * sobre branco, na largura de um talão (cabe em papel de 80 mm ou numa folha A4).
 * `onlyCustomer`: na conta do cliente, os pedidos de outras pessoas da mesma conta aparecem só como total.
 */
export function ReceiptView({ receipt, onlyCustomer }: { receipt: Receipt; onlyCustomer?: string }) {
  const { payment: p, orders } = receipt;
  const voided = p.status === "voided";
  return (
    <article
      data-testid="receipt"
      data-status={p.status}
      className="mx-auto w-full max-w-md rounded-2xl border border-kau-800 bg-kau-900 p-6 text-sm text-mist print:max-w-[76mm] print:rounded-none print:border-0 print:bg-white print:p-0 print:text-[11px] print:text-black"
    >
      <header className="text-center">
        <p className="font-display text-2xl text-white print:text-black">{site.name}</p>
        <p className="text-xs">{site.tagline}</p>
        <p className="text-xs">{site.address} · {site.phoneDisplay}</p>
      </header>

      <div className="my-4 border-t border-dashed border-kau-800 print:border-black" />
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em]">Recibo de pagamento</p>
        <p className="font-display text-xl text-white print:text-black" data-testid="receipt-number">{formatReceiptNumber(p.receiptNumber, p.origin)}</p>
        <p className="text-xs">{when(p.createdAt)} · {p.tableLabel}</p>
        {voided ? (
          <p className="mt-2 inline-block rounded-full bg-[#e48a7d]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#e48a7d] print:border print:border-black print:bg-transparent print:text-black" data-testid="receipt-status">
            Anulado
          </p>
        ) : (
          <p className="mt-2 inline-block rounded-full bg-[#7fc290]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#7fc290] print:border print:border-black print:bg-transparent print:text-black" data-testid="receipt-status">
            Pago · confirmado
          </p>
        )}
      </div>

      <div className="my-4 border-t border-dashed border-kau-800 print:border-black" />
      <ul className="space-y-3">
        {orders.map((o) => {
          const hidden = onlyCustomer && o.customerId !== onlyCustomer;
          return (
            <li key={o.id}>
              <p className="flex justify-between text-xs uppercase tracking-wider">
                <span>Pedido {formatOrderNumber(o.number, o.origin)}</span>
                <span>{when(o.createdAt)}</span>
              </p>
              {hidden ? (
                <p className="flex justify-between"><span>Outros consumos da mesa</span><span className="tabular-nums">{formatXOF(o.total)}</span></p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {o.items.map((i, k) => (
                    <li key={k}>
                      <p className="flex justify-between gap-3 text-white print:text-black">
                        <span>{i.quantity}× {i.name}</span>
                        <span className="shrink-0 tabular-nums">{formatXOF(i.quantity * i.unitPrice)}</span>
                      </p>
                      {i.quantity > 1 && <p className="text-xs">({formatXOF(i.unitPrice)} cada)</p>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {orders.length === 0 && <li className="text-xs">Pedidos não disponíveis neste servidor.</li>}
      </ul>

      <div className="my-4 border-t border-dashed border-kau-800 print:border-black" />
      <dl className="space-y-1">
        <div className="flex justify-between font-display text-lg text-white print:text-black"><dt>Total pago</dt><dd className="tabular-nums" data-testid="receipt-total">{formatXOF(p.amount)}</dd></div>
        <div className="flex justify-between"><dt>Método</dt><dd>{PAYMENT_LABEL[p.method]}</dd></div>
        {p.tendered != null && (
          <>
            <div className="flex justify-between"><dt>Entregue</dt><dd className="tabular-nums">{formatXOF(p.tendered)}</dd></div>
            <div className="flex justify-between"><dt>Troco</dt><dd className="tabular-nums">{formatXOF(p.change ?? 0)}</dd></div>
          </>
        )}
        <div className="flex justify-between"><dt>Recebido por</dt><dd>{p.receivedBy}</dd></div>
        {p.note && <div className="flex justify-between gap-3"><dt>Nota</dt><dd className="text-right">{p.note}</dd></div>}
      </dl>
      {voided && (
        <p className="mt-3 rounded-xl border border-[#e48a7d]/40 p-3 text-xs text-[#e48a7d] print:border-black print:text-black">
          Anulado em {p.voidedAt ? when(p.voidedAt) : "—"} por {p.voidedBy}: {p.voidReason}
        </p>
      )}

      <div className="my-4 border-t border-dashed border-kau-800 print:border-black" />
      <p className="text-center text-[0.7rem] leading-relaxed">
        Pagamento recebido no restaurante e confirmado pelo gerente. Comprovativo interno — não substitui fatura.
      </p>
      <div className="mt-5 flex justify-center print:hidden"><PrintButton /></div>
    </article>
  );
}
