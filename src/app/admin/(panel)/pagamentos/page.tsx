import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { parseRange } from "@/lib/stats";
import { listPayments } from "@/lib/payments";
import { RangeFilter } from "@/components/admin/RangeFilter";
import { PaymentsList } from "@/components/admin/PaymentsList";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "Pagamentos" };

/** Pagamentos recebidos em mão e confirmados pelo gerente. Imutáveis: só se anulam, com motivo. */
export default async function Page({ searchParams }: PageProps<"/admin/pagamentos">) {
  await requireManager();
  const range = parseRange(await searchParams);
  const { payments, summary } = await listPayments(range.from, range.to);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-white">Pagamentos</h1>
        <p className="text-sm text-mist">Recebidos em mão no restaurante e confirmados no painel da mesa (Mesas → escolher a mesa → Conta). Um pagamento não se altera nem se apaga: só se anula, com motivo — tudo fica registado.</p>
      </div>
      <RangeFilter base="/admin/pagamentos" range={range} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="payments-summary">
        <div className="rounded-2xl border border-kau-800 bg-kau-900 p-4">
          <p className="text-xs uppercase tracking-wider text-mist">Recebido</p>
          <p className="mt-1 font-display text-3xl text-white" data-testid="payments-total">{formatXOF(summary.total)}</p>
          <p className="mt-1 text-xs text-mist">{summary.count} pagamento(s){summary.voided ? ` · ${summary.voided} anulado(s)` : ""}</p>
        </div>
        {summary.byMethod.map((m) => (
          <div key={m.method} className="rounded-2xl border border-kau-800 bg-kau-900 p-4">
            <p className="text-xs uppercase tracking-wider text-mist">{PAYMENT_LABEL[m.method]}</p>
            <p className="mt-1 font-display text-2xl text-white">{formatXOF(m.total)}</p>
            <p className="mt-1 text-xs text-mist">{m.count} pagamento(s)</p>
          </div>
        ))}
      </section>
      <PaymentsList payments={payments} />
    </div>
  );
}
