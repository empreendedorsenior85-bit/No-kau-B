import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomer } from "@/lib/customers";
import { getReceipt } from "@/lib/payments";
import { ReceiptView } from "@/components/receipt/ReceiptView";
import { BrandLoader } from "@/components/brand/BrandLoader";

export const metadata: Metadata = { title: "Recibo", robots: { index: false, follow: false } };

export default function Page({ params }: PageProps<"/cliente/recibos/[id]">) {
  return (
    <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader /></div>}>
      <Content params={params} />
    </Suspense>
  );
}

/** Recibo para o cliente: só abre se o pagamento incluir pelo menos um pedido feito com a conta dele. */
async function Content({ params }: { params: PageProps<"/cliente/recibos/[id]">["params"] }) {
  const { id } = await params;
  const c = await getCustomer();
  if (!c) redirect(`/cliente/entrar?volta=${encodeURIComponent(`/cliente/recibos/${id}`)}`);
  const receipt = await getReceipt(id);
  // recibo inexistente ou de outra pessoa → a mesma resposta (não revela que existe)
  if (!receipt || !receipt.orders.some((o) => o.customerId === c.id)) notFound();
  return (
    <main className="min-h-svh bg-kau-950 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-md space-y-4">
        <Link href="/cliente" className="text-sm text-gold-300 underline underline-offset-4 print:hidden">← Os meus pedidos</Link>
        <ReceiptView receipt={receipt} onlyCustomer={c.id} />
      </div>
    </main>
  );
}
