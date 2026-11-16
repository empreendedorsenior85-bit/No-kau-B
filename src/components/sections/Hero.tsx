"use client";
import Image from "next/image";
import * as m from "motion/react-m";
import { useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/brand/Logo";
import { site } from "@/lib/site";

const d = (s: number) => ({ animationDelay: `${s}s` });

/**
 * Hero: a fotografia real do salão é revelada por um foco de luz (como os spots sobre as máscaras).
 * Entradas em CSS (visíveis mesmo sem JS); Motion apenas para a profundidade ao fazer scroll.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 80]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.08]);

  return (
    <section ref={ref} className="relative isolate grid min-h-[100svh] overflow-hidden bg-kau-950 lg:grid-cols-[1.05fr_1fr]">
      <div className="absolute inset-0 lg:relative lg:order-2 lg:m-6 lg:ml-0 lg:mt-24 lg:overflow-hidden lg:rounded-[2rem]">
        <m.div className="absolute inset-0" style={{ y, scale }}>
          <div
            className="nk-spot absolute inset-0"
            style={{
              WebkitMaskImage: "radial-gradient(circle at 55% 30%, #000 var(--r), transparent calc(var(--r) * 1.6))",
              maskImage: "radial-gradient(circle at 55% 30%, #000 var(--r), transparent calc(var(--r) * 1.6))",
            }}
          >
            <Image
              src="/photos/mesa-mascaras.jpg"
              alt="Salão do Nô Kau: parede em madeira com máscaras africanas e mesa posta"
              fill
              priority
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="object-cover object-[60%_30%]"
            />
          </div>
        </m.div>
        <div className="absolute inset-0 bg-gradient-to-t from-kau-950 from-35% via-kau-950/80 to-kau-950/20 lg:bg-gradient-to-r lg:from-kau-950/40 lg:via-transparent lg:to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col justify-end px-6 pb-24 pt-28 sm:px-10 lg:order-1 lg:justify-center lg:px-16 lg:pb-0 xl:px-24">
        <div className="nk-logo mb-8 w-fit rounded-full shadow-[0_0_60px_-10px_rgba(169,134,44,0.6)]" style={d(0.3)}>
          <Logo size={112} priority className="h-[84px] w-[84px] sm:h-[112px] sm:w-[112px]" />
        </div>

        <p className="nk-fade-up font-display text-[0.8rem] uppercase tracking-[var(--tracking-eyebrow)] text-gold-300" style={d(0.6)}>
          {site.tagline}
          <span className="hidden sm:inline"> · Bissau</span>
        </p>

        <h1 className="mt-5 max-w-[15ch] font-display text-[2.5rem] leading-[1.05] text-white sm:text-6xl xl:text-7xl">
          <span className="block overflow-hidden pb-1">
            <span className="nk-rise block" style={d(0.75)}>Onde a gastronomia</span>
          </span>
          <span className="block overflow-hidden pb-1">
            <span className="nk-rise block" style={d(0.87)}>encontra</span>
          </span>
          <span className="block overflow-hidden pb-2">
            <em className="nk-rise block text-gold-300" style={d(1.0)}>a cultura.</em>
          </span>
        </h1>

        <p className="nk-fade-up mt-6 max-w-md text-base leading-relaxed text-white/80 sm:text-lg" style={d(1.25)}>
          Grelhados, cocktails, música e as histórias da Guiné-Bissau — à mesa, na Rua 7, em Bissau.
        </p>

        <div className="nk-fade-up mt-9 flex flex-col gap-3 sm:flex-row" style={d(1.45)}>
          <ButtonLink href="/menu" size="lg">Explorar Menu</ButtonLink>
          <ButtonLink href="/reservas" size="lg" variant="outline">Reservar Mesa</ButtonLink>
        </div>
      </div>

      <div aria-hidden className="nk-fade-up pointer-events-none absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 lg:block" style={d(2.2)}>
        <span className="block h-10 w-px animate-pulse bg-gradient-to-b from-gold-300 to-transparent" />
      </div>
    </section>
  );
}
