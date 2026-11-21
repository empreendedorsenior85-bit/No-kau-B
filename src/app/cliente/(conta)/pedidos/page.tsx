import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { OrderList } from "@/components/client/AccountLists";
import { requireCustomer } from "@/lib/client-account";
import { customerOrders } from "@/lib/customers";

export const metadata: Metadata = { title: "Os meus pedidos", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense fallback={<div className="grid min-h-[60vh] place-items-center"><BrandLoader /></div>}><Content /></Suspense>;
}

/** Todos os pedidos feitos à mesa com a conta, o estado de cada um e se já está pago. */
async function Content() {
  const c = await requireCustomer("/cliente/pedidos");
  const orders = await customerOrders(c.id);
  return (
    <ClientShell account={{ name: c.name, email: c.email }} title="Os meus pedidos" intro="Pedidos feitos à mesa com esta conta. O estado e o pagamento atualizam-se sozinhos.">
      <OrderList items={orders} />
      <p className="mt-8 text-center text-sm"><Link href="/menu" className="text-gold-300 underline underline-offset-4">Ver o menu</Link></p>
    </ClientShell>
  );
}
