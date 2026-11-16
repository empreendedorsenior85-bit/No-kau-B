"use client";
import { useId, useMemo, useRef, useState } from "react";
import { CHART, niceScale, tick } from "./chart-utils";

export type LineSeries = { name: string; values: number[]; kind: "accent" | "muted" };

/**
 * Linhas de 2px (+ área a 10% na série principal), grelha fina, ponto final com anel,
 * cursor vertical e dica única com todas as séries, navegação por teclado e vista em tabela.
 */
export function LineChart({
  labels, tooltipLabels, series, format, height = 260, unit,
}: { labels: string[]; tooltipLabels: string[]; series: LineSeries[]; format: (n: number) => string; height?: number; unit: string }) {
  const W = 720, H = height, L = 48, R = 16, T = 12, B = 28;
  const n = labels.length;
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const max = Math.max(...series.flatMap((s) => s.values), 0);
  const sc = useMemo(() => niceScale(max), [max]);
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - v / sc.max) * (H - T - B);
  const path = (v: number[]) => v.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const ticksY = [0, 1, 2, 3, 4].map((k) => k * sc.step);
  const every = Math.max(1, Math.ceil(n / 7));
  const accent = series.find((s) => s.kind === "accent");

  const idxFromEvent = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return Math.min(n - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * (n - 1))));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    else if (e.key === "Escape") setHover(null);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-4 text-xs text-mist" aria-label="Legenda">
            {series.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: s.kind === "accent" ? CHART.accent : CHART.muted }} />
                {s.name}
              </li>
            ))}
          </ul>
        ) : <span />}
        <button onClick={() => setTable((v) => !v)} className="rounded-full border border-kau-800 px-3 py-1.5 text-xs text-mist hover:text-white" aria-pressed={table}>
          {table ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>

      {table ? (
        <div className="max-h-72 overflow-auto rounded-xl border border-kau-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-kau-900 text-mist"><tr><th className="p-2 font-medium">Período</th>{series.map((s) => <th key={s.name} className="p-2 text-right font-medium">{s.name}</th>)}</tr></thead>
            <tbody>{labels.map((_, i) => (
              <tr key={i} className="border-t border-kau-800"><td className="p-2 text-mist">{tooltipLabels[i]}</td>{series.map((s) => <td key={s.name} className="p-2 text-right tabular-nums text-white">{format(s.values[i] ?? 0)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div
          ref={ref}
          className="relative touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
          tabIndex={0}
          role="img"
          aria-label={`Gráfico de linhas: ${unit}. ${series.map((s) => s.name).join(" e ")}. Use as setas para percorrer os pontos.`}
          onPointerMove={(e) => setHover(idxFromEvent(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
            {ticksY.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={CHART.grid} strokeWidth="1" />
                <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={CHART.axis}>{tick(v, sc.max)}</text>
              </g>
            ))}
            {labels.map((l, i) => (i % every === 0 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={CHART.axis}>{l}</text> : null))}
            {accent && (
              <>
                <defs><linearGradient id={`${id}-a`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={CHART.accent} stopOpacity="0.14" /><stop offset="1" stopColor={CHART.accent} stopOpacity="0.02" /></linearGradient></defs>
                <path d={`${path(accent.values)} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={`url(#${id}-a)`} />
              </>
            )}
            {[...series].sort((a) => (a.kind === "muted" ? -1 : 1)).map((s) => (
              <path key={s.name} d={path(s.values)} fill="none" stroke={s.kind === "accent" ? CHART.accent : CHART.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={s.kind === "muted" ? 0.85 : 1} />
            ))}
            {accent && n > 0 && <circle cx={x(n - 1)} cy={y(accent.values[n - 1] ?? 0)} r="4" fill={CHART.accent} stroke={CHART.surface} strokeWidth="2" />}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={CHART.axis} strokeWidth="1" opacity="0.5" />
                {series.map((s) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4" fill={s.kind === "accent" ? CHART.accent : CHART.muted} stroke={CHART.surface} strokeWidth="2" />)}
              </g>
            )}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-[10rem] rounded-xl border border-kau-800 bg-kau-950/95 px-3 py-2 text-xs shadow-xl"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > n * 0.6 ? "calc(-100% - 12px)" : "12px"})` }}
              role="status"
            >
              <p className="text-mist">{tooltipLabels[hover]}</p>
              {series.map((s) => (
                <p key={s.name} className="mt-1 flex items-center gap-2">
                  <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: s.kind === "accent" ? CHART.accent : CHART.muted }} />
                  <strong className="tabular-nums text-sm text-white">{format(s.values[hover] ?? 0)}</strong>
                  <span className="text-mist">{s.name}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
