import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { getReceipt } from "@/lib/payments";
import { ReceiptView } from "@/components/receipt/ReceiptView";

export const metadata: Metadata = { title: "Recibo" };

/** Recibo de um pagamento (Admin e Gerente): para consultar, imprimir ou guardar em PDF. */
export default async function Page({ params }: PageProps<"/admin/pagamentos/[id]">) {
  await requireManager();
  const receipt = await getReceipt((await params).id);
  if (!receipt) notFound();
  return (
    <div className="space-y-4">
      <Link href="/admin/pagamentos" className="text-sm text-gold-300 underline underline-offset-4 print:hidden">← Pagamentos</Link>
      <ReceiptView receipt={receipt} />
    </div>
  );
}
