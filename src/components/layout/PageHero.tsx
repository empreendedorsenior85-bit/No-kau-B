import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { DiamondBand } from "@/components/brand/DiamondPattern";

export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: ReactNode; intro?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-kau-950 pt-32 sm:pt-40">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-gold/15 blur-[120px]"
      />
      <div className="relative mx-auto max-w-7xl px-6 pb-14 sm:px-8 sm:pb-20">
        <Eyebrow className="animate-[nk-in_.7s_var(--ease-luxe)_both]">{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-4xl animate-[nk-in_.9s_.1s_var(--ease-luxe)_both] font-display text-[2.6rem] leading-[1.05] text-white sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        {intro && (
          <p className="mt-6 max-w-2xl animate-[nk-in_.9s_.2s_var(--ease-luxe)_both] text-base leading-relaxed text-mist sm:text-lg">
            {intro}
          </p>
        )}
        {children}
      </div>
      <DiamondBand className="text-gold" opacity={0.25} id="band-pagehero" />
    </section>
  );
}
