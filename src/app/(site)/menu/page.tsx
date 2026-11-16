import type { Metadata } from "next";
import { PageHero } from "@/components/layout/PageHero";
import { MenuBrowser } from "@/components/menu/MenuBrowser";
import { Provisional } from "@/components/ui/Provisional";
import { ButtonLink } from "@/components/ui/Button";
import { menuIsDemo } from "@/content/menu";

export const metadata: Metadata = {
  title: "Menu",
  description: "O menu do Nô Kau: grelhados, especialidades da casa, pratos tradicionais, sobremesas, bebidas e cocktails.",
};

export default function MenuPage() {
  return (
    <main>
      <PageHero
        eyebrow="Gastronomia"
        title={<>O nosso <em className="text-gold-300">menu</em></>}
        intro="Da grelha ao copo. Preços em francos CFA."
      >
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ButtonLink href="/reservas" size="lg">Reservar mesa</ButtonLink>
          {menuIsDemo && <Provisional>Menu em preparação — conteúdo de demonstração</Provisional>}
        </div>
      </PageHero>
      <div className="bg-white text-kau-950">
        <div className="mx-auto max-w-7xl px-6 pb-16 sm:px-8">
          {menuIsDemo && (
            <p className="mx-auto max-w-3xl pt-10 text-center text-sm leading-relaxed text-stone">
              Os pratos abaixo são exemplos para demonstrar o funcionamento do menu. Os pratos, ingredientes e preços
              reais serão publicados pelo restaurante.
            </p>
          )}
          <MenuBrowser />
        </div>
      </div>
    </main>
  );
}
