import { Suspense } from "react";
import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { PaymentList } from "@/components/client/AccountLists";
import { requireCustomer } from "@/lib/client-account";
import { customerPayments } from "@/lib/payments";
import { formatXOF } from "@/lib/format";
import { PAYMENT_ACCEPTED_TEXT } from "@/lib/types";

export const metadata: Metadata = { title: "Pagamentos e recibos", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense fallback={<div className="grid min-h-[60vh] place-items-center"><BrandLoader /></div>}><Content /></Suspense>;
}

/** Todos os pagamentos confirmados pelo restaurante para os pedidos do cliente, cada um com o seu recibo. */
async function Content() {
  const c = await requireCustomer("/cliente/pagamentos");
  const payments = await customerPayments(c.id);
  const ok = payments.filter((p) => p.status === "confirmed");
  return (
    <ClientShell account={{ name: c.name, email: c.email }} title="Pagamentos e recibos" intro={`O pagamento é feito no restaurante (${PAYMENT_ACCEPTED_TEXT}) e confirmado pelo gerente. Toque num pagamento para ver, imprimir ou guardar o recibo.`}>
      {payments.length > 0 && (
        <p className="mb-6 rounded-2xl border border-kau-800 bg-kau-900 p-4 text-sm text-mist" data-testid="payments-total-client">
          Total pago: <strong className="font-display text-xl text-white">{formatXOF(ok.reduce((n, p) => n + p.amount, 0))}</strong> · {ok.length} pagamento(s)
          {payments.length > ok.length && ` · ${payments.length - ok.length} anulado(s)`}
        </p>
      )}
      <PaymentList items={payments} />
    </ClientShell>
  );
}
