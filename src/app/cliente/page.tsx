import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { customerOrders, getCustomer } from "@/lib/customers";
import { clientLogoutAction } from "./actions";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL, STATUS_CLIENT, formatOrderNumber, type PaymentMethod } from "@/lib/types";

export const metadata: Metadata = { title: "Os meus pedidos", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader /></div>}><Content /></Suspense>;
}

async function Content() {
  const c = await getCustomer();
  if (!c) redirect("/cliente/entrar");
  const orders = await customerOrders(c.id);
  const unpaid = orders.filter((o) => !o.paid).reduce((n, o) => n + o.total, 0);
  return (
    <ClientShell title={`Olá, ${c.name.split(" ")[0]}`} intro="Os seus pedidos no Nô Kau. O pagamento é feito no restaurante e confirmado pelo gerente.">
      <section className="rounded-2xl border border-kau-800 bg-kau-900 p-4 text-sm" data-testid="client-profile">
        <p className="text-white">{c.name}</p>
        <p className="text-mist">{c.email} · {c.phone}</p>
        <form action={clientLogoutAction} className="mt-3"><input type="hidden" name="volta" value="/cliente" /><button className="text-xs text-mist underline underline-offset-4 hover:text-white">Terminar sessão</button></form>
      </section>
      {orders.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-kau-800 p-8 text-center text-mist">Ainda não tem pedidos. Leia o QR Code da sua mesa para pedir — com a sessão iniciada, os pedidos aparecem aqui.</p>
      ) : (
        <>
          {unpaid > 0 && <p className="mt-6 text-sm text-[#f3d29b]" data-testid="unpaid-total">Por pagar: <strong>{formatXOF(unpaid)}</strong> (pague no restaurante).</p>}
          <ul className="mt-4 space-y-3" data-testid="client-orders">
            {orders.map((o) => (
              <li key={o.id} className="rounded-2xl border border-kau-800 bg-kau-900 p-4" data-testid="client-order" data-paid={o.paid ? "1" : "0"}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl text-white">{formatOrderNumber(o.number, o.origin)} · {o.tableLabel}</p>
                    <p className="text-xs text-mist">{new Date(o.createdAt).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bissau" })} · {STATUS_CLIENT[o.status].title}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-wider ${o.paid ? "bg-[#7fc290]/15 text-[#7fc290]" : "bg-[#e0a64a]/15 text-[#e0a64a]"}`}>
                    {o.paid ? `Pago${o.paymentMethod ? ` · ${PAYMENT_LABEL[o.paymentMethod as PaymentMethod] ?? ""}` : ""}` : "Por pagar"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-mist">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                <p className="mt-1 font-display text-lg text-gold-300">{formatXOF(o.total)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-8 text-center text-sm"><Link href="/menu" className="text-gold-300 underline underline-offset-4">Ver o menu</Link></p>
    </ClientShell>
  );
}
