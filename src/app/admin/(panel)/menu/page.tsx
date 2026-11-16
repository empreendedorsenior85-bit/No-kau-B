import type { Metadata } from "next";
import { MenuManager } from "@/components/admin/MenuManager";
import { requireManager } from "@/lib/auth";
import { getAdminMenu } from "@/lib/menu-db";
import { CATALOG_ITEMS } from "@/content/nokau-menu";

export const metadata: Metadata = { title: "Menu" };

export default async function Page() {
  const me = await requireManager();
  const cats = await getAdminMenu();
  const have = new Map(cats.flatMap((c) => c.itemsAll.map((i) => [`${c.id}|${i.name}`, i.imageUrl] as const)));
  const catalog = {
    canImport: me.role === "admin", total: CATALOG_ITEMS.length,
    present: CATALOG_ITEMS.filter((i) => have.has(`${i.cat}|${i.name}`)).length,
    // produtos que já existem, sem nenhuma foto, e para os quais há foto no catálogo
    photos: CATALOG_ITEMS.filter((i) => i.image && have.has(`${i.cat}|${i.name}`) && !have.get(`${i.cat}|${i.name}`)).length,
  };
  return (
    <>
      <h1 className="mb-2 font-display text-3xl text-white">Menu</h1>
      <p className="mb-8 max-w-2xl text-sm text-mist">Os produtos, preços e fotografias que os clientes veem ao ler o QR Code. Produtos indisponíveis aparecem no menu mas não podem ser pedidos.</p>
      <MenuManager categories={cats.map((c) => ({ id: c.id, label: c.label, description: c.description, active: c.active, items: c.itemsAll }))} catalog={catalog} />
    </>
  );
}
