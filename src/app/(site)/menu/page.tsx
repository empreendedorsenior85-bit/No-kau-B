import type { Metadata } from "next";
import { PageHero } from "@/components/layout/PageHero";
import { MenuBrowser } from "@/components/menu/MenuBrowser";
import { Provisional } from "@/components/ui/Provisional";
import { ButtonLink } from "@/components/ui/Button";
import { categories as demoCategories, items as demoItems } from "@/content/menu";
import { getPublicSiteMenu } from "@/lib/menu-db";
import { OfflineMenu } from "@/components/pwa/OfflineMenu";

export const metadata: Metadata = {
  title: "Menu",
  description: "O menu do Nô Kau: entradas, peixes e mariscos, carnes grelhadas, pizzas, sandes, bebidas e vinhos. Preços em francos CFA.",
};

export default async function MenuPage() {
  // menu real (painel do restaurante); sem base de dados, a estrutura de demonstração — assinalada como tal
  const live = await getPublicSiteMenu();
  const isDemo = !live;
  return (
    <main>
      <PageHero
        eyebrow="Gastronomia"
        title={<>O nosso <em className="text-gold-300">menu</em></>}
        intro="Da grelha ao copo. Preços em francos CFA."
      >
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ButtonLink href="/reservas" size="lg">Reservar mesa</ButtonLink>
          {isDemo && <Provisional>Menu em preparação — conteúdo de demonstração</Provisional>}
        </div>
      </PageHero>
      <div className="bg-white text-kau-950">
        <div className="mx-auto max-w-7xl px-6 pb-16 sm:px-8">
          {isDemo ? (
            <p className="mx-auto max-w-3xl pt-10 text-center text-sm leading-relaxed text-stone">
              Os pratos abaixo são exemplos para demonstrar o funcionamento do menu. Os pratos, ingredientes e preços
              reais serão publicados pelo restaurante.
            </p>
          ) : (
            <p className="mx-auto max-w-3xl pt-10 text-center text-sm leading-relaxed text-stone">
              Para pedir, leia o QR Code da sua mesa. Preços em FCFA; a disponibilidade pode mudar ao longo do dia.
              As fotografias assinaladas como “Imagem ilustrativa” não são dos pratos servidos.
            </p>
          )}
          {live && <OfflineMenu images={live.items.map((i) => i.image).filter((u): u is string => !!u)} />}
          <MenuBrowser categories={live?.categories ?? demoCategories} items={live?.items ?? demoItems} />
        </div>
      </div>
    </main>
  );
}
