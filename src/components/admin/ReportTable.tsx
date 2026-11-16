import type { ReactNode } from "react";
import type { ReportRow } from "@/lib/stats";

const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0, useGrouping: "always" });

/** Tabela de relatório com linha de totais opcional. Valores numéricos alinhados à direita. */
export function ReportTable({ rows, sum, id, empty }: { rows: ReportRow[]; sum?: string[]; id: string; empty: string }) {
  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-kau-800 py-8 text-center text-sm text-mist">{empty}</p>;
  const cols = Object.keys(rows[0]);
  const totals: Record<string, number> = {};
  for (const c of sum ?? []) totals[c] = rows.reduce((s, r) => s + Number(r[c] ?? 0), 0);
  const cell = (v: string | number): ReactNode => (typeof v === "number" ? nf.format(v) : v);
  return (
    <div className="overflow-x-auto rounded-xl border border-kau-800" data-testid={id}>
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="bg-kau-900 text-mist">
          <tr>{cols.map((c, i) => <th key={c} className={`p-3 font-medium ${i ? "text-right" : ""}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-kau-800">
              {cols.map((c, i) => <td key={c} className={`p-3 tabular-nums ${i ? "text-right text-white" : "text-white"}`}>{cell(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
        {sum && sum.length > 0 && (
          <tfoot>
            <tr className="border-t border-kau-800 bg-kau-900 font-medium">
              {cols.map((c, i) => <td key={c} className={`p-3 tabular-nums ${i ? "text-right text-gold-300" : "text-white"}`} data-total={c in totals ? c : undefined}>{i === 0 ? "Total" : c in totals ? nf.format(totals[c]) : ""}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
