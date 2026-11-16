import Link from "next/link";
import { RANGE_LABEL, type Range } from "@/lib/stats";

const PRESETS = ["hoje", "ontem", "7d", "30d", "mes"] as const;

/** Uma só linha de filtros acima do conteúdo: período (predefinições primeiro, depois intervalo livre) e pedidos de teste. */
export function RangeFilter({ base, range }: { base: string; range: Range }) {
  const href = (r: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ r, ...extra });
    if (range.includeTest) p.set("testes", "1");
    return `${base}?${p}`;
  };
  const toggleTest = (() => {
    const p = new URLSearchParams({ r: range.key });
    if (range.key === "custom") { p.set("de", range.from.toISOString().slice(0, 10)); p.set("ate", new Date(+range.to - 86_400_000).toISOString().slice(0, 10)); }
    if (!range.includeTest) p.set("testes", "1");
    return `${base}?${p}`;
  })();
  const de = range.from.toISOString().slice(0, 10);
  const ate = new Date(+range.to - 86_400_000).toISOString().slice(0, 10);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
      {PRESETS.map((k) => (
        <Link key={k} href={href(k)} aria-current={range.key === k ? "true" : undefined} data-testid={`range-${k}`}
          className={`rounded-full px-4 py-2 text-sm ${range.key === k ? "bg-gold text-kau-950" : "bg-kau-900 text-mist hover:text-white"}`}>
          {RANGE_LABEL[k]}
        </Link>
      ))}
      <form method="get" action={base} className="flex w-full flex-wrap items-center gap-2 rounded-2xl bg-kau-900 px-3 py-2 sm:w-auto sm:rounded-full sm:py-1">
        <input type="hidden" name="r" value="custom" />
        {range.includeTest && <input type="hidden" name="testes" value="1" />}
        <label className="sr-only" htmlFor="rf-de">De</label>
        <input id="rf-de" name="de" type="date" defaultValue={range.key === "custom" ? de : undefined} required className="h-8 rounded-lg bg-kau-950 px-2 text-sm text-white [color-scheme:dark]" />
        <span className="text-mist" aria-hidden>→</span>
        <label className="sr-only" htmlFor="rf-ate">Até</label>
        <input id="rf-ate" name="ate" type="date" defaultValue={range.key === "custom" ? ate : undefined} required className="h-8 rounded-lg bg-kau-950 px-2 text-sm text-white [color-scheme:dark]" />
        <button className={`rounded-full px-3 py-1.5 text-sm ${range.key === "custom" ? "bg-gold text-kau-950" : "text-gold-300 hover:text-white"}`}>Aplicar</button>
      </form>
      <Link href={toggleTest} className="ml-auto flex items-center gap-2 text-sm text-mist hover:text-white" data-testid="toggle-test">
        <span aria-hidden className={`grid h-4 w-4 place-items-center rounded border ${range.includeTest ? "border-gold bg-gold text-kau-950" : "border-kau-800"}`}>{range.includeTest ? "✓" : ""}</span>
        Incluir pedidos de teste
      </Link>
    </div>
  );
}
