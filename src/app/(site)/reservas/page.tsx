import type { Metadata } from "next";
import { PageHero } from "@/components/layout/PageHero";
import { ReservationForm } from "@/components/forms/ReservationForm";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Reservar mesa",
  description: "Peça a sua reserva no Nô Kau, Rua 7, Bissau. Confirmação feita pelo restaurante.",
};

const steps = [
  ["Envie o pedido", "Preencha os dados da sua reserva."],
  ["Nós confirmamos", "O restaurante verifica a disponibilidade e responde-lhe."],
  ["Bem-vindo", "A sua mesa fica à sua espera."],
];

export default function ReservasPage() {
  return (
    <main>
      <PageHero eyebrow="Reservas" title={<>Uma mesa <em className="text-gold-300">à sua espera</em>.</>} intro="Peça a sua reserva em menos de um minuto. A confirmação é sempre feita pelo restaurante." />
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-16 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:py-24">
        <aside>
          <Eyebrow>Como funciona</Eyebrow>
          <ol className="mt-6 space-y-6">
            {steps.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/60 font-display text-gold-300">{i + 1}</span>
                <div>
                  <p className="font-display text-xl text-white">{t}</p>
                  <p className="mt-1 text-sm text-mist">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10 rounded-2xl border border-kau-800 bg-kau-900 p-6">
            <p className="text-sm text-mist">Prefere falar connosco?</p>
            <a href={`tel:${site.phoneE164}`} className="mt-1 block font-display text-2xl text-white hover:text-gold-300">
              {site.phoneDisplay}
            </a>
            <a href="/minhas-reservas" className="mt-4 block text-sm text-gold-300 underline underline-offset-4">Ver as minhas reservas</a>
            <p className="mt-3 text-xs text-mist">Grupos acima de 30 pessoas: veja os <a href="/eventos#privados" className="text-gold-300 underline">eventos privados</a>.</p>
          </div>
        </aside>
        <div className="rounded-[1.75rem] border border-kau-800 bg-kau-950 p-6 sm:p-10">
          <ReservationForm />
        </div>
      </section>
    </main>
  );
}
