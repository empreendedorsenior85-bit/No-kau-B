"use client";
import { useMemo, useState } from "react";
import type { Order } from "@/lib/types";
import { useLive } from "./LiveOrders";
import { OrderCard, STATUS_STYLE } from "./OrderCard";

export type TableInfo = { id: number; number: number; label: string; active: boolean };
type Filter = "all" | "pending" | "preparing" | "done";

export function TablesView({ tables }: { tables: TableInfo[] }) {
  const { orders, loaded } = useLive();
  const [sel, setSel] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [older, setOlder] = useState<Record<number, Order[]>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [histErr, setHistErr] = useState<string | null>(null);

  const stats = useMemo(() => {
    const m = new Map<number, { pending: number; preparing: number; done: number }>();
    for (const t of tables) m.set(t.id, { pending: 0, preparing: 0, done: 0 });
    for (const o of orders) { const s = m.get(o.tableId); if (s) s[o.status]++; }
    return m;
  }, [orders, tables]);

  const tone = (id: number): "pending" | "preparing" | "done" | "none" => {
    const s = stats.get(id)!;
    return s.pending ? "pending" : s.preparing ? "preparing" : s.done ? "done" : "none";
  };

  const visible = tables.filter((t) => t.active && (filter === "all" || stats.get(t.id)![filter] > 0));
  const selTable = tables.find((t) => t.id === sel) ?? null;

  const tableOrders = (() => {
    if (!selTable) return [];
    const live = orders.filter((o) => o.tableId === selTable.id);
    const ids = new Set(live.map((o) => o.id));
    return [...live, ...(older[selTable.id] ?? []).filter((o) => !ids.has(o.id))].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  })();

  const loadOlder = async () => {
    if (!selTable) return;
    setLoadingOlder(true);
    setHistErr(null);
    try {
      const have = tableOrders;
      const before = have.length ? have[have.length - 1].createdAt : null;
      const r = await fetch(`/api/admin/orders?table=${selTable.id}${before ? `&before=${encodeURIComponent(before)}` : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const data: { orders: Order[] } = await r.json();
      setOlder((o) => ({ ...o, [selTable.id]: [...(o[selTable.id] ?? []), ...data.orders] }));
      if (data.orders.length === 0) setHistErr("Sem mais pedidos.");
    } catch {
      setHistErr("Não foi possível carregar o histórico.");
    }
    setLoadingOlder(false);
  };

  if (!loaded) return <p className="py-20 text-center text-mist">A carregar…</p>;

  const FILTERS: [Filter, string][] = [["all", "Todas"], ["pending", "Com pendentes"], ["preparing", "Em preparação"], ["done", "Com concluídos"]];
  const TONE_LABEL = { pending: "Pendente", preparing: "Em preparação", done: "Concluído", none: "Livre" } as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
      <div>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar mesas">
          {FILTERS.map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={`rounded-full px-4 py-2 text-sm ${filter === f ? "bg-gold text-kau-950" : "bg-kau-900 text-mist hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((t) => {
            const s = stats.get(t.id)!;
            const k = tone(t.id);
            return (
              <li key={t.id}>
                <button
                  onClick={() => setSel(t.id)}
                  data-testid={`table-${t.number}`}
                  data-tone={k}
                  aria-pressed={sel === t.id}
                  className={`relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-colors ${sel === t.id ? "border-gold" : "border-kau-800"} bg-kau-900 hover:border-gold/60`}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${k === "none" ? "bg-kau-800" : STATUS_STYLE[k].bar} ${k === "pending" ? "animate-pulse" : ""}`} />
                  <p className="font-display text-xl text-white">{t.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-mist">{TONE_LABEL[k]}</p>
                  <p className="mt-3 flex gap-3 text-sm">
                    <span title="Pendentes" className="text-[#e0a64a]">● {s.pending}</span>
                    <span title="Em preparação" className="text-[#8ab9e6]">◐ {s.preparing}</span>
                    <span title="Concluídos (24 h)" className="text-[#7fc290]">✓ {s.done}</span>
                  </p>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="col-span-full rounded-2xl border border-dashed border-kau-800 py-12 text-center text-mist">Nenhuma mesa neste filtro.</li>}
        </ul>
      </div>

      <aside aria-label="Pedidos da mesa" className="lg:sticky lg:top-28 lg:max-h-[calc(100svh-8rem)] lg:self-start lg:overflow-y-auto">
        {!selTable ? (
          <p className="rounded-2xl border border-dashed border-kau-800 p-8 text-center text-mist">Escolha uma mesa para ver os pedidos e o histórico.</p>
        ) : (
          <div>
            <h2 className="mb-3 font-display text-2xl text-white">{selTable.label}</h2>
            <div className="space-y-4">
              {tableOrders.map((o) => <OrderCard key={o.id} order={o} />)}
              {tableOrders.length === 0 && <p className="rounded-2xl border border-dashed border-kau-800 p-6 text-center text-sm text-mist">Sem pedidos recentes.</p>}
            </div>
            <button onClick={loadOlder} disabled={loadingOlder} className="mt-4 w-full rounded-full border border-kau-800 py-3 text-sm text-mist hover:text-white disabled:opacity-50">
              {loadingOlder ? "A carregar…" : "Carregar histórico mais antigo"}
            </button>
            {histErr && <p className="mt-2 text-center text-sm text-mist">{histErr}</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
