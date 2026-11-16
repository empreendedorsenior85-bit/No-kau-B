import Image from "next/image";
import Link from "next/link";
import { Hero } from "@/components/sections/Hero";
import { Reveal } from "@/components/motion/Reveal";
import { DiamondMark } from "@/components/brand/DiamondPattern";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { categories } from "@/content/menu";
import { mapsLinks, site } from "@/lib/site";

/** Os três pilares — todos confirmados pelo logótipo ou pelas informações públicas. */
const pillars = [
  { t: "Grill", d: "A grelha está no nome da casa. Brasa, fumo e sabor, para partilhar à mesa." },
  { t: "Bar & cocktails", d: "Os cocktails estão entre o que os nossos clientes mais elogiam. O balcão é para ficar." },
  { t: "Música & karaoke", d: "Em noites especiais, música ao vivo e karaoke. O microfone é seu." },
];

export default function Home() {
  return (
    <main>
      <Hero />

      {/* A experiência */}
      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <SectionHeading
            eyebrow="A experiência"
            title={<>Sabor, memória <em className="text-gold-300">e voz</em>.</>}
            intro="Mais do que um restaurante: um lugar onde se come bem, se conversa sem pressa e, quando a noite pede, se canta."
          />
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {pillars.map((p, i) => (
            <Reveal key={p.t} delay={i * 0.1}>
              <article className="group relative h-full overflow-hidden rounded-[1.75rem] border border-kau-800 bg-kau-900 p-8 transition-[transform,border-color] duration-500 ease-[var(--ease-luxe)] hover:-translate-y-1 hover:border-gold/50">
                <DiamondMark className="absolute -right-6 -top-6 text-gold/10 transition-transform duration-700 group-hover:rotate-45" size={120} />
                <span className="font-display text-sm text-gold-300">0{i + 1}</span>
                <h3 className="mt-6 font-display text-3xl text-white">{p.t}</h3>
                <p className="mt-3 leading-relaxed text-mist">{p.d}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Cultura — vaca bruto */}
      <section className="relative overflow-hidden bg-gold text-kau-950">
        <div className="mx-auto grid max-w-5xl items-center justify-center gap-12 px-6 py-24 sm:px-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-20 lg:py-32">
          <Reveal className="mx-auto w-full max-w-[22rem]">
            {/* Moldura em arco, concêntrica com a imagem (espaçamento uniforme) */}
            <div className="rounded-t-full border border-kau-950/35 p-3">
              <div className="relative aspect-[3/4] overflow-hidden rounded-t-full">
                <Image
                  src="/photos/vaca-bruto-vermelha.jpg"
                  alt="Máscara de boi com chifres, pintada de vermelho e branco, com triângulo branco na testa — inspirada nas máscaras vaca bruto dos Bijagós"
                  fill
                  sizes="(min-width: 1024px) 352px, 90vw"
                  className="object-cover"
                />
              </div>
            </div>
            <p className="mt-4 text-center font-display text-sm italic text-kau-950/80">Inspirada na vaca bruto, Bijagós</p>
          </Reveal>
          <Reveal delay={0.1} className="text-center lg:text-left">
            <Eyebrow tone="light">Cultura & património</Eyebrow>
            <h2 className="mt-4 font-display text-[2.3rem] leading-[1.05] sm:text-5xl lg:text-[3.4rem]">
              Mais do que um símbolo, <em>uma memória que atravessa gerações.</em>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-kau-950/85 lg:mx-0">
              Nos Bijagós, o gado selvagem — <em>vaca bruto</em>, em kriol — ganha forma em máscaras dançadas nas
              cerimónias de iniciação, em festivais e em dias de festa nacional. É uma das tradições que inspiram a
              nossa casa.
            </p>
            <ButtonLink href="/cultura" variant="dark" size="lg" className="mt-9">
              Conhecer a história
            </ButtonLink>
          </Reveal>
        </div>
      </section>

      {/* O salão */}
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-24 sm:px-8 sm:py-32 lg:grid-cols-2 lg:items-center">
        <Reveal className="order-2 lg:order-1">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] ring-1 ring-kau-800">
            <Image
              src="/photos/parede-mascaras.jpg"
              alt="Parede do Nô Kau com máscaras iluminadas por spots de luz quente"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover transition-transform duration-[1400ms] ease-[var(--ease-luxe)] hover:scale-105"
            />
          </div>
        </Reveal>
        <Reveal delay={0.1} className="order-1 lg:order-2">
          <SectionHeading
            eyebrow="A nossa casa"
            title={<>Madeira, máscaras e <em className="text-gold-300">luz quente</em>.</>}
            intro="Cada parede conta uma história. Cada mesa espera por uma conversa. Venha conhecer o espaço que os nossos clientes descrevem como único."
          />
          <ButtonLink href="/sobre" variant="outline" className="mt-8">
            A nossa história
          </ButtonLink>
        </Reveal>
      </section>

      {/* Menu — secção clara */}
      <section className="bg-white text-kau-950">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-8 sm:py-32">
          <Reveal className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <SectionHeading
              tone="light"
              eyebrow="Gastronomia"
              title={<>Da grelha <em className="text-umber">ao copo</em>.</>}
              intro="O menu está a ser preparado pelo restaurante. Explore a estrutura e volte em breve para conhecer os pratos."
            />
            <ButtonLink href="/menu" variant="dark" size="lg">
              Explorar o menu
            </ButtonLink>
          </Reveal>
          <ul className="mt-14 grid gap-px overflow-hidden rounded-[1.75rem] bg-gold-100 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((c, i) => (
              <Reveal as="li" key={c.id} delay={(i % 4) * 0.06} className="h-full">
                  <Link
                    href={`/menu?categoria=${c.id}`}
                    className="group flex h-full flex-col justify-between gap-6 bg-gold-50 p-7 transition-colors duration-300 hover:bg-gold-100"
                  >
                    <span className="font-display text-2xl">{c.label}</span>
                    <span className="flex items-center justify-between text-sm text-stone">
                      {c.description}
                      <span aria-hidden className="text-umber transition-transform duration-300 group-hover:translate-x-1">→</span>
                    </span>
                  </Link>
              </Reveal>
            ))}
            <li className="flex flex-col justify-center gap-4 bg-kau-950 p-7 text-white">
              <span className="font-display text-2xl">Reserve a sua mesa</span>
              <Link href="/reservas" className="text-sm text-gold-300 underline-offset-4 hover:underline">
                Pedir reserva →
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* Eventos */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/10 blur-[120px]" />
        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:px-8 sm:py-32">
          <Reveal>
            <SectionHeading
              align="center"
              eyebrow="À noite"
              title={<>Quando a música começa, <em className="text-gold-300">a casa canta.</em></>}
              intro="Música ao vivo, noites de karaoke e celebrações privadas. Aniversários, jantares de família, encontros de empresa — preparamos a noite consigo."
            />
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/eventos" size="lg">Eventos e jantares privados</ButtonLink>
              <ButtonLink href={site.instagram} target="_blank" rel="noopener noreferrer" variant="outline" size="lg">
                Novidades no Instagram
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Contacto */}
      <section className="border-t border-kau-800 bg-kau-900">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:px-8 md:grid-cols-3">
          <Reveal>
            <Eyebrow>Morada</Eyebrow>
            <p className="mt-3 text-lg text-white">{site.address}</p>
            <p className="mt-1 text-sm text-mist">Plus Code {site.plusCode}</p>
          </Reveal>
          <Reveal delay={0.1}>
            <Eyebrow>Contacto</Eyebrow>
            <a href={`tel:${site.phoneE164}`} className="mt-3 block text-lg text-white hover:text-gold-300">
              {site.phoneDisplay}
            </a>
            <a href={site.instagram} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm text-mist hover:text-gold-300">
              Instagram {site.instagramHandle}
            </a>
          </Reveal>
          <Reveal delay={0.2} className="flex flex-col items-start gap-3 md:items-end md:justify-center">
            <ButtonLink href={mapsLinks.directions} target="_blank" rel="noopener noreferrer">
              Obter direções
            </ButtonLink>
            <ButtonLink href="/contacto" variant="outline">
              Todos os contactos
            </ButtonLink>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
