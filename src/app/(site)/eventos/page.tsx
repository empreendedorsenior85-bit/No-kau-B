import type { Metadata } from "next";
import { PageHero } from "@/components/layout/PageHero";
import { Reveal } from "@/components/motion/Reveal";
import { PrivateEventForm } from "@/components/forms/PrivateEventForm";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { DiamondMark } from "@/components/brand/DiamondPattern";
import { ButtonLink } from "@/components/ui/Button";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Eventos & jantares privados",
  description: "Música ao vivo, karaoke e celebrações privadas no Nô Kau, em Bissau.",
};

/** Eventos publicados — preenchido pelo painel na Fase 4. Nunca inventar eventos. */
const publishedEvents: { title: string; date: string; time: string; description: string }[] = [];

const experiences = [
  ["Música ao vivo", "Em ocasiões especiais, a casa recebe música ao vivo."],
  ["Noites de karaoke", "O microfone passa de mesa em mesa. Escolha a sua canção."],
  ["Experiências gastronómicas", "Noites temáticas e menus especiais, anunciados com antecedência."],
];

const privateTypes = ["Aniversários", "Jantares privados", "Encontros familiares", "Celebrações", "Eventos de empresa"];

export default function EventosPage() {
  return (
    <main>
      <PageHero
        eyebrow="Eventos"
        title={<>Noites para <em className="text-gold-300">lembrar</em>.</>}
        intro="Música, karaoke e celebrações. Acompanhe a programação e reserve o seu momento."
      />

      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8">
        <SectionHeading eyebrow="Agenda" title="Próximos eventos" />
        {publishedEvents.length === 0 ? (
          <div className="mt-10 flex flex-col items-start gap-6 rounded-[1.75rem] border border-dashed border-kau-800 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <DiamondMark className="shrink-0 text-gold" />
              <div>
                <p className="font-display text-2xl text-white">Ainda sem eventos anunciados.</p>
                <p className="mt-1 text-mist">A programação é publicada aqui e no nosso Instagram.</p>
              </div>
            </div>
            <ButtonLink href={site.instagram} target="_blank" rel="noopener noreferrer" variant="outline">
              Seguir {site.instagramHandle}
            </ButtonLink>
          </div>
        ) : null}

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {experiences.map(([t, d], i) => (
            <Reveal key={t} delay={i * 0.08} as="article" className="rounded-[1.75rem] border border-kau-800 bg-kau-900 p-8">
              <h3 className="font-display text-2xl text-white">{t}</h3>
              <p className="mt-3 text-mist">{d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="privados" className="scroll-mt-24 border-t border-kau-800 bg-kau-900">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 sm:px-8 lg:grid-cols-[1fr_1.5fr] lg:py-28">
          <div>
            <SectionHeading
              eyebrow="Jantares privados"
              title={<>A sua celebração, <em className="text-gold-300">na nossa casa.</em></>}
              intro="Conte-nos o que imagina. Preparamos uma proposta à medida — espaço, menu e música."
            />
            <ul className="mt-8 flex flex-wrap gap-2">
              {privateTypes.map((t) => (
                <li key={t} className="rounded-full border border-gold/40 px-4 py-1.5 text-sm text-gold-300">{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[1.75rem] border border-kau-800 bg-kau-950 p-6 sm:p-10">
            <PrivateEventForm />
          </div>
        </div>
      </section>
    </main>
  );
}
