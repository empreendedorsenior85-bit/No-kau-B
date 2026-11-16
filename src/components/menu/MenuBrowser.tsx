"use client";
import { useMemo, useState } from "react";
import { useClientValue } from "@/lib/use-client-value";
import { Reveal } from "@/components/motion/Reveal";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { categories, items, type MenuItem } from "@/content/menu";
import { formatXOF } from "@/lib/format";
import { DiamondMark } from "@/components/brand/DiamondPattern";

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const readCategoryFromUrl = () => new URLSearchParams(window.location.search).get("categoria") ?? "";
const isCategory = (id: string | null) => !!id && categories.some((c) => c.id === id);

/**
 * Sem useSearchParams/Suspense: o servidor renderiza o menu completo (visível sem JS);
 * no cliente, a categoria do URL (?categoria=) é aplicada.
 */
export function MenuBrowser() {
  const urlCat = useClientValue(readCategoryFromUrl);
  const [chosen, setChosen] = useState<string | null>(null);
  const cat = chosen ?? (isCategory(urlCat) ? urlCat! : "todos");
  const [q, setQ] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const select = (id: string) => {
    setChosen(id);
    const url = new URL(window.location.href);
    if (id === "todos") url.searchParams.delete("categoria");
    else url.searchParams.set("categoria", id);
    window.history.replaceState(window.history.state, "", url);
  };

  const filtered = useMemo(() => {
    const nq = normalize(q.trim());
    return items.filter(
      (i) =>
        (cat === "todos" || i.category === cat) &&
        (!onlyAvailable || i.available === true) &&
        (!nq || normalize(`${i.name} ${i.description} ${(i.ingredients ?? []).join(" ")}`).includes(nq)),
    );
  }, [cat, q, onlyAvailable]);

  const groups = categories
    .map((c) => ({ ...c, items: filtered.filter((i) => i.category === c.id) }))
    .filter((g) => g.items.length);

  return (
    <div>
      {/* Controlos */}
      <div className="sticky top-16 z-30 -mx-6 border-b border-gold-100 bg-white/95 px-6 py-4 backdrop-blur sm:top-20 sm:-mx-8 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Categorias" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {[{ id: "todos", label: "Tudo" }, ...categories].map((c) => {
              const active = cat === c.id;
              return (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => select(c.id)}
                  className={`relative shrink-0 rounded-full px-4 py-2 text-sm transition-colors duration-300 ${
                    active ? "text-white" : "text-stone hover:text-kau-950"
                  }`}
                >
                  {active && (
                    <m.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-kau-950" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                  )}
                  <span className="relative">{c.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4">
            <label className="relative flex-1 lg:w-64 lg:flex-none">
              <span className="sr-only">Pesquisar no menu</span>
              <svg aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar pratos…"
                className="h-11 w-full rounded-full border border-gold-100 bg-gold-50 pl-10 pr-4 text-base text-kau-950 placeholder:text-stone focus:border-umber focus:outline-none"
              />
            </label>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-stone">
              <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="h-4 w-4 accent-[#5f4923]" />
              Disponíveis
            </label>
          </div>
        </div>
      </div>

      {/* Resultados */}
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={`${cat}-${onlyAvailable}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="py-12"
          aria-live="polite"
        >
          {groups.length === 0 ? (
            <div className="py-20 text-center">
              <DiamondMark className="mx-auto text-gold" />
              <p className="mt-5 font-display text-2xl">Nenhum prato encontrado.</p>
              <p className="mt-2 text-stone">
                {onlyAvailable ? "A disponibilidade dos pratos ainda não foi confirmada pelo restaurante." : "Experimente outra pesquisa ou categoria."}
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.id} className="mb-16 last:mb-0" aria-labelledby={`cat-${g.id}`}>
                <div className="flex items-baseline justify-between gap-4 border-b border-gold-100 pb-4">
                  <h2 id={`cat-${g.id}`} className="font-display text-3xl sm:text-4xl">
                    {g.label}
                  </h2>
                  <p className="hidden text-sm text-stone sm:block">{g.description}</p>
                </div>
                <ul className="mt-6 grid gap-5 md:grid-cols-2">
                  {g.items.map((it, i) => (
                    <MenuCard key={it.id} item={it} index={i} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </m.div>
      </AnimatePresence>
    </div>
  );
}

function MenuCard({ item, index }: { item: MenuItem; index: number }) {
  return (
    <Reveal
      as="li"
      delay={(index % 2) * 0.06}
      className="group relative overflow-hidden rounded-[1.5rem] border border-gold-100 bg-gold-50 p-6 transition-[box-shadow,transform] duration-500 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(95,73,35,0.45)]"
    >
      <DiamondMark className="absolute -right-5 -top-5 text-gold/15 transition-transform duration-700 group-hover:rotate-45" size={96} />
      <div className="relative flex items-start justify-between gap-6">
        <div>
          {item.demo && (
            <span className="inline-flex rounded-full border border-dashed border-umber/60 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-umber">
              Demonstração
            </span>
          )}
          <h3 className="mt-3 font-display text-xl sm:text-2xl">{item.name}</h3>
          <p className="mt-2 text-sm leading-relaxed text-stone">{item.description}</p>
          {item.ingredients?.length ? <p className="mt-2 text-xs text-stone">{item.ingredients.join(" · ")}</p> : null}
        </div>
        <p className="shrink-0 text-right font-display text-lg text-umber">
          {item.price != null ? formatXOF(item.price) : <span className="text-sm italic text-stone">Preço a confirmar</span>}
        </p>
      </div>
      <p className="relative mt-5 text-xs uppercase tracking-[0.16em] text-stone">
        {item.available === true ? "Disponível" : item.available === false ? "Indisponível" : "Disponibilidade a confirmar"}
      </p>
    </Reveal>
  );
}
