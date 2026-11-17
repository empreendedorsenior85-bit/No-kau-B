import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TableMenu } from "@/components/table/TableMenu";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { DiamondMark } from "@/components/brand/DiamondPattern";
import { dbConfigured } from "@/lib/db";
import { getPublicMenu, getTableByToken } from "@/lib/menu-db";
import { isQrToken } from "@/lib/tokens";
import { getCustomer } from "@/lib/customers";

export const metadata: Metadata = { title: "Faça o seu pedido", robots: { index: false, follow: false } };

export default function Page({ params }: PageProps<"/m/[token]">) {
  return (
    <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader label="A abrir o menu…" /></div>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/m/[token]">["params"] }) {
  const { token } = await params;
  if (!isQrToken(token) || !dbConfigured()) notFound();
  const table = await getTableByToken(token);
  if (!table) notFound();
  const categories = await getPublicMenu();

  if (categories.length === 0) {
    return (
      <main className="grid min-h-svh place-items-center bg-kau-950 px-6 text-center">
        <div>
          <DiamondMark className="mx-auto text-gold" size={56} />
          <h1 className="mt-6 font-display text-3xl text-white">{table.label}</h1>
          <p className="mt-3 max-w-sm text-mist">O menu digital está a ser preparado. Peça ajuda a um empregado para fazer o seu pedido.</p>
        </div>
      </main>
    );
  }
  const customer = await getCustomer().catch(() => null);
  return <TableMenu token={token} table={{ number: table.number, label: table.label }} categories={categories} customer={customer ? { name: customer.name } : null} />;
}
