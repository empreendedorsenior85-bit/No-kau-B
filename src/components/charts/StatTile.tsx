import { CHART, delta } from "./chart-utils";

/** Mini-gráfico de tendência: linha na cor de de-ênfase, ponto final no acento. Sem eixos. */
export function Sparkline({ values }: { values: number[] }) {
  // máx. 12 pontos: agrupa se houver mais
  const pts = values.length > 12 ? Array.from({ length: 12 }, (_, i) => {
    const a = Math.floor((i * values.length) / 12), b = Math.floor(((i + 1) * values.length) / 12);
    return values.slice(a, Math.max(b, a + 1)).reduce((s, v) => s + v, 0);
  }) : values;
  if (pts.length < 2) return <svg aria-hidden width="72" height="28" />;
  const w = 72, h = 28, pad = 4, max = Math.max(...pts, 1), min = Math.min(...pts, 0);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (pts.length - 1);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = pts.length - 1;
  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke={CHART.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(pts[last])} r="4" fill={CHART.accent} stroke={CHART.surface} strokeWidth="2" />
    </svg>
  );
}

const DELTA_STYLE = {
  up: "bg-ok/15 text-[#7fc290]", down: "bg-danger/15 text-[#e48a7d]", flat: "bg-white/5 text-mist", new: "bg-white/5 text-mist",
} as const;
const ARROW = { up: "▲", down: "▼", flat: "•", new: "✦" } as const;

export function DeltaBadge({ cur, prev, upIsGood = true }: { cur: number; prev: number; upIsGood?: boolean }) {
  const d = delta(cur, prev);
  // cor = direção × se subir é bom; ícone + sinal acompanham sempre (nunca só cor)
  const dir = d.dir === "up" || d.dir === "down" ? ((d.dir === "up") === upIsGood ? "up" : "down") : d.dir;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${DELTA_STYLE[dir]}`}>
      <span aria-hidden>{ARROW[d.dir]}</span>
      <span>{d.text}</span>
    </span>
  );
}

/** Cartão de indicador: etiqueta · valor · variação vs período anterior · tendência. */
export function StatTile({
  label, value, sub, cur, prev, trend, upIsGood = true, testId,
}: { label: string; value: string; sub?: string; cur?: number; prev?: number; trend?: number[]; upIsGood?: boolean; testId?: string }) {
  return (
    <div className="rounded-2xl border border-kau-800 bg-kau-900 p-5" data-testid={testId}>
      <p className="text-sm text-mist">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-sans text-3xl font-semibold tabular-nums text-white" data-value>{value}</p>
        {trend && <Sparkline values={trend} />}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-mist">
        {cur !== undefined && prev !== undefined && <DeltaBadge cur={cur} prev={prev} upIsGood={upIsGood} />}
        <span>{sub ?? "vs período anterior"}</span>
      </p>
    </div>
  );
}
