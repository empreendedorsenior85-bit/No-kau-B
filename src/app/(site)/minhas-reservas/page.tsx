import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/layout/PageHero";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { ClaimForm } from "@/components/reservations/ClaimForm";
import { getVisitor, visitorReservations } from "@/lib/visitors";
import { forgetVisitorAction } from "@/app/actions";
import { RESERVATION_LABEL, fmtResDate } from "@/lib/types";

export const metadata: Metadata = { title: "As minhas reservas", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <main>
      <PageHero eyebrow="Reservas" title={<>As minhas <em className="text-gold-300">reservas</em>.</>} intro="Sem palavra-passe: as reservas feitas neste aparelho ficam aqui, com o estado sempre atualizado." />
      <Suspense fallback={<div className="grid min-h-[30vh] place-items-center"><BrandLoader /></div>}>
        <Content />
      </Suspense>
    </main>
  );
}

const badge = (s: string) =>
  s === "approved" ? "bg-[#7fc290]/15 text-[#7fc290]" : s === "pending" ? "bg-[#e0a64a]/15 text-[#e0a64a]" : s === "rejected" ? "bg-[#e48a7d]/15 text-[#e48a7d]" : "bg-white/5 text-mist";

async function Content() {
  const v = await getVisitor();
  const list = v ? await visitorReservations(v.id) : [];
  return (
    <section className="mx-auto max-w-3xl space-y-8 px-6 py-14 sm:px-8">
      {v ? (
        <div className="rounded-2xl border border-kau-800 bg-kau-900 p-5" data-testid="visitor-profile">
          <p className="font-display text-2xl text-white">Olá, {v.name.split(" ")[0]}</p>
          <p className="mt-1 text-sm text-mist">{v.name} · {v.phone}{v.email ? ` · ${v.email}` : ""}</p>
          <p className="mt-2 text-xs text-mist">Perfil guardado neste aparelho. Os seus dados servem só para gerir as suas reservas.</p>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-kau-800 p-6 text-sm text-mist" data-testid="visitor-empty">
          Ainda não fez reservas neste aparelho. Ao reservar, o seu perfil (nome e telefone) é guardado automaticamente — sem palavra-passe.
        </p>
      )}

      {v && (
        <div data-testid="visitor-reservations">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl text-white">Reservas</h2>
            <Link href="/reservas" className="text-sm text-gold-300 underline underline-offset-4">Fazer outra reserva</Link>
          </div>
          {list.length === 0 ? <p className="mt-3 text-sm text-mist">Sem reservas.</p> : (
            <ul className="mt-3 space-y-2">
              {list.map((r) => (
                <li key={r.code}>
                  <a href={`/reserva/${r.token}`} data-testid="visitor-reservation" data-status={r.status}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-kau-800 bg-kau-900 p-4 hover:border-gold/60">
                    <span className="text-sm">
                      <span className="block capitalize text-white">{fmtResDate(r.date)} · {r.time}</span>
                      <span className="text-mist">{r.code} · {r.guests} {r.guests === 1 ? "pessoa" : "pessoas"}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-wider ${badge(r.status)}`}>{RESERVATION_LABEL[r.status]}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-kau-800 bg-kau-900 p-5">
        <h2 className="font-display text-xl text-white">Reservou noutro telemóvel?</h2>
        <p className="mt-1 mb-4 text-sm text-mist">Junte-a aqui com o telefone e o código da reserva (ex.: R-AB12CD), que aparece na confirmação.</p>
        <ClaimForm />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/reservas" className="text-gold-300 underline underline-offset-4">Reservar mesa</Link>
        {v && (
          <form action={forgetVisitorAction}>
            <button className="text-mist underline underline-offset-4 hover:text-white" data-testid="visitor-forget">Esquecer este aparelho</button>
          </form>
        )}
      </div>
    </section>
  );
}
