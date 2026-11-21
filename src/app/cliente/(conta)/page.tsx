import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { OrderList, PaymentList, ReservationList } from "@/components/client/AccountLists";
import { LegacyHashRedirect } from "@/components/client/LegacyHashRedirect";
import { RememberMany } from "@/components/reservations/RememberReservation";
import { ReservationNotifier } from "@/components/reservations/ReservationNotifier";
import { accountData, isUpcoming, requireCustomer } from "@/lib/client-account";
import { clientLogoutAction } from "../actions";
import { formatXOF } from "@/lib/format";

export const metadata: Metadata = { title: "A minha conta", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense fallback={<div className="grid min-h-[60vh] place-items-center"><BrandLoader /></div>}><Content /></Suspense>;
}

/** Resumo da conta: números principais e o mais recente de cada área (reservas, pagamentos, pedidos). */
async function Content() {
  const c = await requireCustomer("/cliente");
  const { orders, reservations, payments } = await accountData(c.id);
  const unpaid = orders.filter((o) => !o.paid).reduce((n, o) => n + o.total, 0);
  const next = reservations.filter(isUpcoming);
  const confirmed = payments.filter((p) => p.status === "confirmed");
  const cards = [
    { id: "reservas", href: "/cliente/reservas", label: "Próximas reservas", value: String(next.length), sub: next[0] ? `${next[0].date.split("-").reverse().join("/")} · ${next[0].time}` : "nenhuma marcada" },
    { id: "porpagar", href: "/cliente/pedidos", label: "Por pagar", value: formatXOF(unpaid), sub: unpaid ? "pague no restaurante" : "tudo pago", warn: unpaid > 0 },
    { id: "pagamentos", href: "/cliente/pagamentos", label: "Pagamentos", value: String(confirmed.length), sub: confirmed[0] ? `último: ${formatXOF(confirmed[0].amount)}` : "ainda nenhum" },
    { id: "pedidos", href: "/cliente/pedidos", label: "Pedidos", value: String(orders.length), sub: orders.length ? `${orders.filter((o) => o.status !== "done").length} em curso` : "ainda nenhum" },
  ];
  return (
    <ClientShell account={{ name: c.name, email: c.email }} title={`Olá, ${c.name.split(" ")[0]}`} intro="Os seus pedidos no Nô Kau. O pagamento é feito no restaurante e confirmado pelo gerente.">
      <LegacyHashRedirect />
      <section className="rounded-2xl border border-kau-800 bg-kau-900 p-4 text-sm" data-testid="client-profile">
        <p className="text-white">{c.name}</p>
        <p className="text-mist">{c.email} · {c.phone}</p>
        <form action={clientLogoutAction} className="mt-3"><input type="hidden" name="volta" value="/cliente" /><button className="text-xs text-mist underline underline-offset-4 hover:text-white">Terminar sessão</button></form>
      </section>
      <section aria-label="Resumo" className="mt-6 grid grid-cols-2 gap-3" data-testid="client-summary">
        {cards.map((k) => (
          <Link key={k.id} href={k.href} data-testid={`summary-${k.id}`} className="rounded-2xl border border-kau-800 bg-kau-900 p-4 hover:border-gold/60">
            <span className="block text-xs uppercase tracking-wider text-mist">{k.label}</span>
            <span className={`mt-1 block font-display text-2xl ${k.warn ? "text-[#f3d29b]" : "text-white"}`} data-value>{k.value}</span>
            <span className="block truncate text-xs text-mist">{k.sub}</span>
          </Link>
        ))}
      </section>
      <RememberMany items={reservations.map((r) => ({ token: r.token, code: r.code, date: r.date, status: r.status }))} />
      <div className="mt-8"><ReservationList items={reservations} limit={3} /></div>
      <div className="mt-8"><PaymentList items={payments} limit={3} /></div>
      <div className="mt-8"><OrderList items={orders} limit={5} /></div>
      <ReservationNotifier />
      <p className="mt-8 text-center text-sm"><Link href="/menu" className="text-gold-300 underline underline-offset-4">Ver o menu</Link></p>
    </ClientShell>
  );
}
