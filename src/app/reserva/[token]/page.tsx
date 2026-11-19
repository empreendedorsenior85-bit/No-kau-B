import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { Logo } from "@/components/brand/Logo";
import { RememberReservation } from "@/components/reservations/RememberReservation";
import { ReservationLive } from "@/components/reservations/ReservationLive";
import { cancelReservationAction } from "@/app/actions";
import { dbConfigured } from "@/lib/db";
import { isResToken, reservationByToken } from "@/lib/reservations";
import { site } from "@/lib/site";
import { RESERVATION_LABEL, fmtResDate } from "@/lib/types";

export const metadata: Metadata = { title: "A sua reserva", robots: { index: false, follow: false } };

export default function Page({ params, searchParams }: PageProps<"/reserva/[token]">) {
  return (
    <div className="nums-lining min-h-svh bg-kau-950">
      <header className="border-b border-kau-800">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3"><Logo size={40} className="h-10 w-10" /><span className="font-display text-lg text-white">Nô Kau</span></Link>
          <Link href="/reservas" className="text-sm text-gold-300 underline underline-offset-4">Reservas</Link>
        </div>
      </header>
      <main className="px-5 pb-24 pt-10">
        <Suspense fallback={<div className="grid place-items-center py-24"><BrandLoader label="A carregar a reserva…" /></div>}>
          <Content params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

const STYLE = {
  pending: "border-[#e0a64a]/60 bg-[#e0a64a]/10 text-[#f3d29b]",
  approved: "border-[#7fc290]/60 bg-[#7fc290]/10 text-[#a9dbb4]",
  rejected: "border-[#e48a7d]/60 bg-[#e48a7d]/10 text-[#f0b2a8]",
  cancelled: "border-kau-800 bg-kau-900 text-mist",
} as const;
const EXPLAIN = {
  pending: "O restaurante vai analisar o seu pedido. Assim que for aprovado ou rejeitado, é avisado aqui no site — pode fechar esta página.",
  approved: "A sua mesa está reservada. Até breve no Nô Kau!",
  rejected: "Infelizmente não foi possível aceitar esta reserva. Pode pedir outro horário ou ligar-nos.",
  cancelled: "Esta reserva foi cancelada.",
} as const;

async function Content({ params, searchParams }: { params: PageProps<"/reserva/[token]">["params"]; searchParams: PageProps<"/reserva/[token]">["searchParams"] }) {
  const { token } = await params;
  const nova = (await searchParams).nova === "1";
  if (!isResToken(token) || !dbConfigured()) notFound();
  const r = await reservationByToken(token);
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-2xl" data-testid="reservation-page" data-status={r.status}>
      <RememberReservation token={token} code={r.code} date={r.date} status={r.status} />
      <ReservationLive token={token} status={r.status} />
      {nova && r.status === "pending" && (
        <p role="status" className="mb-6 rounded-2xl border border-gold/50 bg-gold/10 p-4 text-sm text-gold-300">
          Pedido de reserva enviado. Guardámos o link desta página neste telemóvel.
        </p>
      )}
      <p className="text-xs uppercase tracking-[0.2em] text-mist">Reserva {r.code}</p>
      <h1 className="mt-2 font-display text-4xl text-white">{r.name.split(" ")[0]}, a sua reserva</h1>
      <div className={`mt-6 rounded-2xl border p-5 ${STYLE[r.status]}`} data-testid="reservation-status">
        <p className="font-display text-2xl">{RESERVATION_LABEL[r.status]}</p>
        <p className="mt-1 text-sm">{EXPLAIN[r.status]}</p>
        {r.decisionNote && <p className="mt-3 rounded-xl bg-black/20 p-3 text-sm text-white">Mensagem do restaurante: “{r.decisionNote}”</p>}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-kau-800 bg-kau-900 p-5 text-sm">
        <div className="col-span-2"><dt className="text-mist">Data</dt><dd className="capitalize text-white">{fmtResDate(r.date)}</dd></div>
        <div><dt className="text-mist">Hora</dt><dd className="text-white">{r.time}</dd></div>
        <div><dt className="text-mist">Pessoas</dt><dd className="text-white">{r.guests}</dd></div>
        {r.notes && <div className="col-span-2"><dt className="text-mist">Observações</dt><dd className="text-white">{r.notes}</dd></div>}
        <div className="col-span-2"><dt className="text-mist">Pedido em</dt><dd className="text-white">{new Date(r.createdAt).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bissau" })}</dd></div>
      </dl>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {r.status === "pending" && (
          <form action={cancelReservationAction}>
            <input type="hidden" name="token" value={token} />
            <button className="rounded-full border border-kau-800 px-5 py-2.5 text-sm text-mist hover:text-white">Cancelar este pedido</button>
          </form>
        )}
        <a href={`tel:${site.phoneE164}`} className="text-sm text-gold-300 underline underline-offset-4">Ligar para o restaurante</a>
        <Link href="/reservas" className="text-sm text-gold-300 underline underline-offset-4">Fazer outra reserva</Link>
        <Link href="/minhas-reservas" className="text-sm text-gold-300 underline underline-offset-4" data-testid="my-reservations-link">As minhas reservas</Link>
      </div>
      <p className="mt-8 text-xs text-mist">Guarde este link: é a forma de acompanhar a reserva. Não o partilhe.</p>
    </div>
  );
}
