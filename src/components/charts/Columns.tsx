"use client";
import { useState } from "react";
import { CHART, int, niceScale, tick } from "./chart-utils";

/** Colunas (≤24 px, extremo superior arredondado, base reta). Valor só no máximo; o resto na dica. */
export function Columns({ data, unitOne, unitMany }: { data: { label: string; sub: string; value: number }[]; unitOne: string; unitMany: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const sc = niceScale(max);
  const peak = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const H = 160;
  return (
    <div className="relative" onPointerLeave={() => setHover(null)}>
      <div className="relative ml-9" style={{ height: H }}>
        {[0, 1, 2, 3, 4].map((k) => (
          <div key={k} className="absolute inset-x-0 border-t border-kau-800" style={{ bottom: `${(k * 25)}%` }}>
            <span className="absolute -left-9 w-7 -translate-y-1/2 text-right text-[11px] text-mist">{tick(k * sc.step, sc.max)}</span>
          </div>
        ))}
        <ol className="absolute inset-0 flex items-end justify-between" aria-label="Pedidos por hora">
          {data.map((d, i) => (
            <li key={i} className="relative flex h-full flex-1 items-end justify-center">
              <button
                type="button"
                onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                className="group flex h-full w-full items-end justify-center outline-none"
                aria-label={`${d.sub}: ${int(d.value)} ${d.value === 1 ? unitOne : unitMany}`}
              >
                <span
                  className={`block w-full max-w-[18px] rounded-t-[4px] transition-[filter] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-gold-300 ${hover === i ? "brightness-125" : ""}`}
                  style={{ height: `${(d.value / sc.max) * 100}%`, minHeight: d.value ? 3 : 0, background: CHART.accent, marginInline: 1 }}
                />
                {i === peak && <span className="pointer-events-none absolute -top-5 text-[11px] font-medium tabular-nums text-white" style={{ bottom: `calc(${(d.value / sc.max) * 100}% + 2px)`, top: "auto" }}>{d.value}</span>}
              </button>
            </li>
          ))}
        </ol>
        {hover !== null && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-kau-800 bg-kau-950/95 px-3 py-2 text-xs shadow-xl" style={{ left: `${((hover + 0.5) / data.length) * 100}%`, bottom: `calc(${(data[hover].value / sc.max) * 100}% + 10px)` }} role="status">
            <strong className="tabular-nums text-sm text-white">{int(data[hover].value)}</strong> <span className="text-mist">{data[hover].value === 1 ? unitOne : unitMany}</span>
            <p className="text-mist">{data[hover].sub}</p>
          </div>
        )}
      </div>
      <div className="ml-9 mt-1 flex justify-between text-[11px] text-mist" aria-hidden>
        {data.map((d, i) => <span key={i} className="flex-1 text-center">{i % 3 === 0 ? d.label : ""}</span>)}
      </div>
    </div>
  );
}
