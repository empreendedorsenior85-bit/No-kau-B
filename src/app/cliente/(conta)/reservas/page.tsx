import { Suspense } from "react";
import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { ReservationList } from "@/components/client/AccountLists";
import { ClaimForm } from "@/components/reservations/ClaimForm";
import { RememberMany } from "@/components/reservations/RememberReservation";
import { ReservationNotifier } from "@/components/reservations/ReservationNotifier";
import { accountReservations, requireCustomer } from "@/lib/client-account";

export const metadata: Metadata = { title: "As minhas reservas", robots: { index: false, follow: false } };

export default function Page({ searchParams }: PageProps<"/cliente/reservas">) {
  return <Suspense fallback={<div className="grid min-h-[60vh] place-items-center"><BrandLoader /></div>}><Content searchParams={searchParams} /></Suspense>;
}

/** Todas as reservas do cliente (da conta e deste aparelho), com o estado sempre atualizado, e "juntar" uma reserva feita noutro telemóvel. */
async function Content({ searchParams }: { searchParams: PageProps<"/cliente/reservas">["searchParams"] }) {
  const c = await requireCustomer("/cliente/reservas");
  const [reservations, sp] = await Promise.all([accountReservations(c.id), searchParams]);
  return (
    <ClientShell account={{ name: c.name, email: c.email }} title="As minhas reservas" intro="Toque numa reserva para ver os detalhes. O estado (pendente, aprovada, rejeitada) atualiza-se sozinho.">
      {sp.juntada === "1" && <p role="status" className="mb-6 rounded-2xl border border-[#7fc290]/40 bg-[#7fc290]/10 p-3 text-sm text-[#a9dbb4]" data-testid="claim-ok">✓ Reserva juntada à sua conta.</p>}
      <RememberMany items={reservations.map((r) => ({ token: r.token, code: r.code, date: r.date, status: r.status }))} />
      <ReservationList items={reservations} title="Reservas"
        empty="Ainda não tem reservas. Reserve uma mesa — com a sessão iniciada, a reserva fica aqui. Reservou sem sessão ou noutro telemóvel? Junte-a abaixo." />
      <div className="mt-8 rounded-2xl border border-kau-800 bg-kau-900 p-5" data-testid="client-claim">
        <h2 className="font-display text-xl text-white">Reservou sem sessão ou noutro telemóvel?</h2>
        <p className="mt-1 mb-4 text-sm text-mist">Junte-a à sua conta com o telefone e o código da reserva (ex.: R-AB12CD), que aparece na confirmação.</p>
        <ClaimForm account />
      </div>
      <ReservationNotifier />
    </ClientShell>
  );
}
