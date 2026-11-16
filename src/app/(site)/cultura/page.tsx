import type { Metadata } from "next";
import Image from "next/image";
import { PageHero } from "@/components/layout/PageHero";
import { Reveal } from "@/components/motion/Reveal";
import { DuotoneImage } from "@/components/ui/DuotoneImage";
import { Provisional } from "@/components/ui/Provisional";
import { ButtonLink } from "@/components/ui/Button";
import { chapters, sources } from "@/content/culture";

export const metadata: Metadata = {
  title: "Cultura & património",
  description: "A vaca bruto dos Bijagós, as ilhas e a voz: as histórias da Guiné-Bissau que inspiram o Nô Kau.",
};

export default function CulturaPage() {
  return (
    <main>
      <PageHero
        eyebrow="Cultura & património"
        title={<>Cada tradição <em className="text-gold-300">guarda uma história.</em></>}
        intro="A Guiné-Bissau tem uma história que merece ser conhecida, valorizada e partilhada. Estas são algumas das que vivem na nossa casa."
      >
        <div className="mt-6"><Provisional>Texto em validação com o restaurante</Provisional></div>
      </PageHero>

      <section className="bg-gold text-kau-950">
        <div className="mx-auto grid max-w-7xl items-end gap-10 px-6 py-20 sm:px-8 lg:grid-cols-2 lg:py-28">
          <Reveal>
            <DuotoneImage
              src="/photos/vaca-bruto-par.jpg"
              alt="Duas máscaras de boi com chifres, uma preta e branca e outra vermelha e branca, ambas com triângulo branco na testa"
              width={540}
              height={290}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[540/290] w-full rounded-[1.75rem] [&_img]:h-full [&_img]:w-full"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="font-display italic text-kau-950/80">Máscaras da sala, inspiradas na vaca bruto (tipo dugn&apos;be).</p>
              <Provisional className="!border-kau-950/60 !text-kau-950">Imagem provisória</Provisional>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="font-display text-[2.2rem] leading-[1.1] sm:text-5xl">
              “No Nô Kau, a cultura não é decoração. <em>É parte da nossa identidade.</em>”
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20 sm:px-8 lg:py-28">
        {chapters.map((c, i) => (
          <Reveal key={c.n} as="article" className="grid gap-6 border-t border-kau-800 py-14 first:border-t-0 first:pt-0 md:grid-cols-[120px_1fr]">
            <span className="font-display text-6xl leading-none text-gold/70 md:text-7xl">{c.n}</span>
            <div>
              <h2 className="font-display text-4xl text-white sm:text-5xl">{c.title}</h2>
              <p className="mt-3 font-display text-xl italic text-gold-300">{c.kicker}</p>
              {c.body.map((p) => (
                <p key={p.slice(0, 20)} className="mt-5 max-w-2xl text-lg leading-relaxed text-mist">
                  {p}
                </p>
              ))}
              {i === 2 && (
                <div className="relative mt-8 aspect-[4/5] max-w-md overflow-hidden rounded-[1.5rem] ring-1 ring-kau-800">
                  <Image src="/photos/mesa-mascaras.jpg" alt="Parede de madeira do Nô Kau com máscaras e mesa posta" fill sizes="(min-width: 768px) 448px, 100vw" className="object-cover" />
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </section>

      <section className="border-t border-kau-800 bg-kau-900">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:px-8">
          <h2 className="font-display text-xl text-white">Fontes</h2>
          <p className="mt-2 text-sm text-mist">
            Respeitamos a cultura que apresentamos. Os factos desta página têm origem em coleções de museus e
            instituições internacionais. As peças da nossa sala são apresentadas como inspiradas nestas tradições.
          </p>
          <ul className="mt-5 space-y-2 text-sm">
            {sources.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-gold-300 underline-offset-4 hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <ButtonLink href="/reservas" className="mt-10">Venha conhecer a nossa casa</ButtonLink>
        </div>
      </section>
    </main>
  );
}
