import { CHART } from "./chart-utils";

export type BarRow = { label: string; value: number; display: string; hint?: string };

/** Barras horizontais ordenadas (do maior para o menor), sempre a mesma cor: dados nominais. Valor junto ao fim da barra. */
export function RankedBars({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-kau-800 py-8 text-center text-sm text-mist">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]" title={r.hint}>
          <span className="truncate text-sm text-white">{r.label}</span>
          <div className="flex items-center gap-3">
            <div className="h-5 flex-1 rounded-[4px] bg-kau-800/60">
              <div className="h-full rounded-r-[4px] rounded-l-[2px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: CHART.accent }} />
            </div>
            <span className="w-28 shrink-0 whitespace-nowrap text-right text-sm tabular-nums text-white">{r.display}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
