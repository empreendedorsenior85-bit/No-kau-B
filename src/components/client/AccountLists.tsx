import Link from "next/link";
import type { ReactNode } from "react";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL, RESERVATION_LABEL, STATUS_CLIENT, fmtResDate, formatOrderNumber, formatReceiptNumber, type PaymentMethod, type PublicReservation } from "@/lib/types";
import type { customerOrders } from "@/lib/customers";
import type { Payment } from "@/lib/payments";

/**
 * Listas da área do cliente (reservas, pagamentos, pedidos) — o mesmo desenho no Resumo e nas páginas de cada opção.
 * `limit` mostra só os mais recentes (Resumo) com a ligação "Ver todos".
 */
export type ClientReservation = PublicReservation & { token: string };
export type ClientOrder = Awaited<ReturnType<typeof customerOrders>>[number];

function Head({ id, title, action }: { id: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="scroll-mt-20 font-display text-2xl text-white">{title}</h2>
      {action}
    </div>
  );
}
const More = ({ href, n, label, id }: { href: string; n: number; label: string; id: string }) => (
  <Link href={href} className="mt-3 inline-flex min-h-11 items-center text-sm text-gold-300 underline underline-offset-4" data-testid={`more-${id}`}>{label} ({n}) →</Link>
);

export function ReservationList({ items, limit, title = "As minhas reservas", empty }: { items: ClientReservation[]; limit?: number; title?: string; empty?: ReactNode }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <section aria-labelledby="minhas-reservas" data-testid="client-reservations">
      <Head id="minhas-reservas" title={title} action={<Link href="/reservas" className="text-sm text-gold-300 underline underline-offset-4">Reservar mesa</Link>} />
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-mist">{empty ?? "Ainda não tem reservas. As reservas feitas com a sessão iniciada aparecem aqui."}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((r) => (
            <li key={r.code}>
              <a href={`/reserva/${r.token}`} className="flex items-center justify-between gap-3 rounded-2xl border border-kau-800 bg-kau-900 p-4 hover:border-gold/60" data-testid="client-reservation" data-status={r.status}>
                <span className="text-sm">
                  <span className="block capitalize text-white">{fmtResDate(r.date)} · {r.time}</span>
                  <span className="text-mist">{r.code} · {r.guests} {r.guests === 1 ? "pessoa" : "pessoas"}</span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-wider ${r.status === "approved" ? "bg-[#7fc290]/15 text-[#7fc290]" : r.status === "pending" ? "bg-[#e0a64a]/15 text-[#e0a64a]" : r.status === "rejected" ? "bg-[#e48a7d]/15 text-[#e48a7d]" : "bg-white/5 text-mist"}`}>{RESERVATION_LABEL[r.status]}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {limit && items.length > limit && <More href="/cliente/reservas" n={items.length} label="Ver todas as reservas" id="reservas" />}
    </section>
  );
}

export function PaymentList({ items, limit }: { items: Payment[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <section aria-labelledby="meus-pagamentos" data-testid="client-payments">
      <Head id="meus-pagamentos" title="Pagamentos e recibos" />
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-mist">Ainda não há pagamentos confirmados. Depois de pagar no restaurante, o recibo aparece aqui.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={`/cliente/recibos/${p.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-kau-800 bg-kau-900 p-4 hover:border-gold/60" data-testid="client-payment" data-status={p.status}>
                <span className="text-sm">
                  <span className="block font-display text-lg text-white">{formatXOF(p.amount)} · {PAYMENT_LABEL[p.method]}</span>
                  <span className="text-mist">{new Date(p.createdAt).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bissau" })} · {formatReceiptNumber(p.receiptNumber, p.origin)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-wider ${p.status === "confirmed" ? "bg-[#7fc290]/15 text-[#7fc290]" : "bg-[#e48a7d]/15 text-[#e48a7d]"}`}>
                  {p.status === "confirmed" ? "Pago · ver recibo" : "Anulado"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {limit && items.length > limit && <More href="/cliente/pagamentos" n={items.length} label="Ver todos os pagamentos" id="pagamentos" />}
    </section>
  );
}

export function OrderList({ items, limit }: { items: ClientOrder[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  const unpaid = items.filter((o) => !o.paid).reduce((n, o) => n + o.total, 0);
  return (
    <section aria-labelledby="meus-pedidos" data-testid="client-orders-section">
      <Head id="meus-pedidos" title="Os meus pedidos" />
      {items.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-kau-800 p-8 text-center text-mist">Ainda não tem pedidos. Leia o QR Code da sua mesa para pedir — com a sessão iniciada, os pedidos aparecem aqui.</p>
      ) : (
        <>
          {unpaid > 0 && <p className="mt-6 text-sm text-[#f3d29b]" data-testid="unpaid-total">Por pagar: <strong>{formatXOF(unpaid)}</strong> (pague no restaurante).</p>}
          <ul className="mt-4 space-y-3" data-testid="client-orders">
            {shown.map((o) => (
              <li key={o.id} className="rounded-2xl border border-kau-800 bg-kau-900 p-4" data-testid="client-order" data-paid={o.paid ? "1" : "0"}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl text-white">{formatOrderNumber(o.number, o.origin)} · {o.tableLabel}</p>
                    <p className="text-xs text-mist">{new Date(o.createdAt).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bissau" })} · {STATUS_CLIENT[o.status].title}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-wider ${o.paid ? "bg-[#7fc290]/15 text-[#7fc290]" : "bg-[#e0a64a]/15 text-[#e0a64a]"}`}>
                    {o.paid ? `Pago${o.paymentMethod ? ` · ${PAYMENT_LABEL[o.paymentMethod as PaymentMethod] ?? ""}` : ""}` : "Por pagar"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-mist">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                <p className="mt-1 font-display text-lg text-gold-300">{formatXOF(o.total)}</p>
              </li>
            ))}
          </ul>
          {limit && items.length > limit && <More href="/cliente/pedidos" n={items.length} label="Ver todos os pedidos" id="pedidos" />}
        </>
      )}
    </section>
  );
}
