import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OrderTracker } from "@/components/table/OrderTracker";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { dbConfigured } from "@/lib/db";
import { getOrderForTable } from "@/lib/orders";
import { isQrToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Pedido enviado", robots: { index: false, follow: false } };

export default function Page({ params }: PageProps<"/m/[token]/pedido/[id]">) {
  return (
    <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader label="A carregar o pedido…" /></div>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/m/[token]/pedido/[id]">["params"] }) {
  const { token, id } = await params;
  if (!isQrToken(token) || !dbConfigured()) notFound();
  const o = await getOrderForTable(id, token);
  if (!o) notFound();
  return (
    <OrderTracker
      token={token}
      orderId={o.id}
      initial={{ number: o.number, origin: o.origin, tableLabel: o.tableLabel, status: o.status, total: o.total, createdAt: o.createdAt, items: o.items }}
    />
  );
}
