import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { customerOrders, getCustomer } from "@/lib/customers";
import { customerPayments } from "@/lib/payments";
import { customerReservations } from "@/lib/reservations";
import { RememberMany } from "@/components/reservations/RememberReservation";
import { ReservationNotifier } from "@/components/reservations/ReservationNotifier";
import { clientLogoutAction } from "./actions";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL, RESERVATION_LABEL, STATUS_CLIENT, fmtResDate, formatOrderNumber, formatReceiptNumber, type PaymentMethod } from "@/lib/types";

export const metadata: Metadata = { title: "Os meus pedidos", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader /></div>}><Content /></Suspense>;
}

async function Content() {
  const c = await getCustomer();
  if (!c) redirect("/cliente/entrar");
  const [orders, reservations, payments] = await Promise.all([customerOrders(c.id), customerReservations(c.id), customerPayments(c.id)]);
  const unpaid = orders.filter((o) => !o.paid).reduce((n, o) => n + o.total, 0);
  return (
    <ClientShell title={`Olá, ${c.name.split(" ")[0]}`} intro="Os seus pedidos no Nô Kau. O pagamento é feito no restaurante e confirmado pelo gerente.">
      <section className="rounded-2xl border border-kau-800 bg-kau-900 p-4 text-sm" data-testid="client-profile">
        <p className="text-white">{c.name}</p>
        <p className="text-mist">{c.email} · {c.phone}</p>
        <form action={clientLogoutAction} className="mt-3"><input type="hidden" name="volta" value="/cliente" /><button className="text-xs text-mist underline underline-offset-4 hover:text-white">Terminar sessão</button></form>
      </section>
      <RememberMany items={reservations.map((r) => ({ token: r.token, code: r.code, date: r.date, status: r.status }))} />
      <section className="mt-6" aria-labelledby="minhas-reservas" data-testid="client-reservations">
        <div className="flex items-baseline justify-between">
          <h2 id="minhas-reservas" className="font-display text-2xl text-white">As minhas reservas</h2>
          <Link href="/reservas" className="text-sm text-gold-300 underline underline-offset-4">Reservar mesa</Link>
        </div>
        {reservations.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Ainda não tem reservas. As reservas feitas com a sessão iniciada aparecem aqui.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reservations.map((r) => (
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
      </section>
      <section className="mt-8" aria-labelledby="meus-pagamentos" data-testid="client-payments">
        <h2 id="meus-pagamentos" className="font-display text-2xl text-white">Pagamentos e recibos</h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Ainda não há pagamentos confirmados. Depois de pagar no restaurante, o recibo aparece aqui.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {payments.map((p) => (
              <li key={p.id}>
                <a href={`/cliente/recibos/${p.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-kau-800 bg-kau-900 p-4 hover:border-gold/60" data-testid="client-payment" data-status={p.status}>
                  <span className="text-sm">
                    <span className="block font-display text-lg text-white">{formatXOF(p.amount)} · {PAYMENT_LABEL[p.method]}</span>
                    <span className="text-mist">{new Date(p.createdAt).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bissau" })} · {formatReceiptNumber(p.receiptNumber, p.origin)}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-wider ${p.status === "confirmed" ? "bg-[#7fc290]/15 text-[#7fc290]" : "bg-[#e48a7d]/15 text-[#e48a7d]"}`}>
                    {p.status === "confirmed" ? "Pago · ver recibo" : "Anulado"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <h2 className="mt-8 font-display text-2xl text-white">Os meus pedidos</h2>
      {orders.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-kau-800 p-8 text-center text-mist">Ainda não tem pedidos. Leia o QR Code da sua mesa para pedir — com a sessão iniciada, os pedidos aparecem aqui.</p>
      ) : (
        <>
          {unpaid > 0 && <p className="mt-6 text-sm text-[#f3d29b]" data-testid="unpaid-total">Por pagar: <strong>{formatXOF(unpaid)}</strong> (pague no restaurante).</p>}
          <ul className="mt-4 space-y-3" data-testid="client-orders">
            {orders.map((o) => (
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
        </>
      )}
      <ReservationNotifier />
      <p className="mt-8 text-center text-sm"><Link href="/menu" className="text-gold-300 underline underline-offset-4">Ver o menu</Link></p>
    </ClientShell>
  );
}
