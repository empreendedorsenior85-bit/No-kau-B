/** Cores dos gráficos (validadas com o validador do dataviz sobre a superfície escura do painel). */
export const CHART = {
  accent: "#a9862c", // dourado do logótipo — a única cor de série (dados nominais: sempre a mesma)
  muted: "#c9c0ad", // cinzento neutro de de-ênfase (período anterior)
  surface: "#231c10", // kau-900: anel/intervalo entre marcas
  grid: "#362c1c", // kau-800: grelha recessiva, linha fina
  axis: "#b6ac9a", // mist: texto de eixos
} as const;

const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0, useGrouping: "always" });
const compact = new Intl.NumberFormat("pt-PT", { notation: "compact", maximumFractionDigits: 1 });
/** Valor de eixo: completo abaixo de 10 000, compacto acima (um só estilo por eixo). */
export const tick = (n: number, axisMax: number) => (axisMax >= 10_000 ? compact.format(n) : nf.format(n));
export const int = (n: number) => nf.format(n);

/** Máximo "redondo" do eixo e intervalo (4 divisões). */
export function niceScale(max: number): { max: number; step: number } {
  if (max <= 0) return { max: 4, step: 1 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return { max: step * 4, step };
}

export type Delta = { text: string; dir: "up" | "down" | "flat" | "new" };
/** Variação face ao período anterior. Sem período anterior com dados, não inventa percentagem. */
export function delta(cur: number, prev: number): Delta {
  if (prev === 0 && cur === 0) return { text: "sem dados", dir: "flat" };
  if (prev === 0) return { text: "novo", dir: "new" };
  const p = ((cur - prev) / prev) * 100;
  if (Math.abs(p) < 0.05) return { text: "0%", dir: "flat" };
  const s = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1, signDisplay: "always" }).format(p);
  return { text: `${s}%`, dir: p > 0 ? "up" : "down" };
}
