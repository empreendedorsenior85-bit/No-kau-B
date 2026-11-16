import type { Metadata } from "next";
import Image from "next/image";
import { PageHero } from "@/components/layout/PageHero";
import { Reveal } from "@/components/motion/Reveal";
import { Provisional } from "@/components/ui/Provisional";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = {
  title: "Sobre nós",
  description: "A filosofia do Nô Kau: gastronomia, cultura guineense e hospitalidade em Bissau.",
};

const values = [
  ["Gastronomia", "Comida feita para partilhar: a grelha, os sabores da terra e um bar onde os cocktails têm assinatura."],
  ["Cultura", "As tradições da Guiné-Bissau vivem nas nossas paredes e nas histórias que contamos. Com respeito e com orgulho."],
  ["Hospitalidade", "Quem entra é recebido como em casa. Sem pressa, com atenção e com tempo para mais uma conversa."],
  ["Voz", "A música faz parte da casa. Em noites especiais, há palco, microfone e canções para todos."],
];

export default function SobrePage() {
  return (
    <main>
      <PageHero
        eyebrow="Sobre nós"
        title={<>Não somos apenas um restaurante. <em className="text-gold-300">Somos uma experiência.</em></>}
      >
        <div className="mt-6"><Provisional>Texto proposto — a validar pelo proprietário</Provisional></div>
      </PageHero>

      <section className="mx-auto grid max-w-7xl gap-14 px-6 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-28">
        <Reveal>
          <div className="relative aspect-[4/5] overflow-hidden rounded-t-full ring-1 ring-kau-800">
            <Image src="/photos/mesa-mascaras.jpg" alt="Mesa do Nô Kau junto à parede de madeira com máscaras" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <SectionHeading eyebrow="A nossa casa" title="Gastronomia, cultura e uma voz." />
          <div className="mt-6 space-y-5 text-lg leading-relaxed text-mist">
            <p>
              O Nô Kau é, em Bissau, um lugar para estar: comer bem, beber melhor e ficar. Um restaurante grill, bar e
              karaoke, onde a madeira, as máscaras e a luz quente criam um ambiente com personalidade própria.
            </p>
            <p>
              O nosso símbolo é uma mulher que canta, de olhos fechados. É assim que queremos que se sinta quem nos
              visita: livre, à vontade, em casa.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="border-t border-kau-800 bg-kau-900">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:py-28">
          <SectionHeading eyebrow="Filosofia" title="O que nos guia" />
          <div className="mt-12 grid gap-px overflow-hidden rounded-[1.75rem] bg-kau-800 sm:grid-cols-2">
            {values.map(([t, d], i) => (
              <Reveal key={t} delay={(i % 2) * 0.08} className="bg-kau-900 p-8 sm:p-10">
                <h3 className="font-display text-3xl text-white">{t}</h3>
                <p className="mt-3 leading-relaxed text-mist">{d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center sm:px-8">
        <Logo size={140} />
        <p className="mt-8 font-display text-3xl leading-snug text-white sm:text-4xl">
          “Cada detalhe tem uma história. Cada sabor representa uma cultura. <em className="text-gold-300">Cada visita é uma experiência.</em>”
        </p>
        <ButtonLink href="/reservas" size="lg" className="mt-10">Reservar mesa</ButtonLink>
      </section>
    </main>
  );
}
