import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { getReceipt } from "@/lib/payments";
import { query } from "@/lib/db";
import { isPrintAgent } from "@/lib/print/agent";
import { ReceiptView } from "@/components/receipt/ReceiptView";
import { ThermalPrintButton } from "@/components/receipt/ThermalPrintButton";

export const metadata: Metadata = { title: "Recibo" };

/** Recibo de um pagamento (Admin e Gerente): consultar, imprimir no navegador/PDF ou, no restaurante, no talão. */
export default async function Page({ params }: PageProps<"/admin/pagamentos/[id]">) {
  await requireManager();
  const receipt = await getReceipt((await params).id);
  if (!receipt) notFound();
  const printers = isPrintAgent()
    ? (await query<{ id: number; name: string; station: string }>("select id, name, station from printers where active order by station desc, name")).rows
    : null;
  return (
    <div className="space-y-4">
      <Link href="/admin/pagamentos" className="text-sm text-gold-300 underline underline-offset-4 print:hidden">← Pagamentos</Link>
      <ReceiptView receipt={receipt} actions={printers ? <ThermalPrintButton paymentId={receipt.payment.id} printers={printers} /> : null} />
    </div>
  );
}
