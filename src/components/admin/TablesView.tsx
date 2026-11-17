"use client";
import { useMemo, useState } from "react";
import type { Order } from "@/lib/types";
import { useLive } from "./LiveOrders";
import { OrderCard, STATUS_STYLE } from "./OrderCard";
import { CallCard, elapsed } from "./CallCard";
import { TableBill } from "./TableBill";
import { CALL_SHORT } from "@/lib/types";
import { useNow } from "@/lib/use-client-value";

export type TableInfo = { id: number; number: number; label: string; active: boolean; waiterId: string | null; waiterName: string | null };
type Filter = "all" | "mine" | "calls" | "pending" | "preparing" | "done";

export function TablesView({ tables }: { tables: TableInfo[] }) {
  const { orders, loaded, calls, me } = useLive();
  const now = useNow(15_000);
  const isWaiter = me.role === "garcom";
  const [sel, setSel] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>(isWaiter && tables.some((t) => t.waiterId === me.id) ? "mine" : "all");
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
  /** Chamadas ativas por mesa (a mais antiga primeiro). */
  const activeCalls = useMemo(() => {
    const m = new Map<number, typeof calls>();
    for (const c of [...calls].reverse()) if (c.status === "open" || c.status === "ack") m.set(c.tableId, [...(m.get(c.tableId) ?? []), c]);
    return m;
  }, [calls]);
  const waitingList = calls.filter((c) => c.status === "open" || c.status === "ack")
    .filter((c) => !isWaiter || filter !== "mine" || !c.waiterId || c.waiterId === me.id)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  const visible = tables.filter((t) => t.active && (
    filter === "all" ? true
      : filter === "mine" ? t.waiterId === me.id
      : filter === "calls" ? (activeCalls.get(t.id)?.length ?? 0) > 0
      : stats.get(t.id)![filter] > 0));
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

  const FILTERS: [Filter, string][] = [
    ...(isWaiter ? [["mine", "As minhas mesas"] as [Filter, string]] : []),
    ["all", "Todas"], ["calls", `Com chamadas${waitingList.length ? ` (${waitingList.length})` : ""}`], ["pending", "Com pendentes"], ["preparing", "Em preparação"], ["done", "Com concluídos"]];
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
        {waitingList.length > 0 && (
          <section aria-labelledby="chamadas" className="mb-5" data-testid="calls-waiting">
            <h2 id="chamadas" className="mb-2 font-display text-xl text-white">Clientes a chamar ({waitingList.length})</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {waitingList.map((c) => <CallCard key={c.id} call={c} />)}
            </div>
          </section>
        )}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((t) => {
            const s = stats.get(t.id)!;
            const k = tone(t.id);
            const tc = activeCalls.get(t.id) ?? [];
            const calling = tc.find((c) => c.status === "open");
            const coming = tc.find((c) => c.status === "ack");
            const mine = isWaiter && t.waiterId === me.id;
            return (
              <li key={t.id}>
                <button
                  onClick={() => setSel(t.id)}
                  data-testid={`table-${t.number}`}
                  data-tone={k}
                  data-call={calling ? "open" : coming ? "ack" : "none"}
                  aria-pressed={sel === t.id}
                  className={`relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-colors ${sel === t.id ? "border-gold" : calling ? "border-[#e48a7d]" : "border-kau-800"} ${calling ? "bg-[#e48a7d]/10" : "bg-kau-900"} hover:border-gold/60`}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${calling ? "animate-pulse bg-[#e48a7d]" : k === "none" ? "bg-kau-800" : STATUS_STYLE[k].bar} ${k === "pending" ? "animate-pulse" : ""}`} />
                  <p className="font-display text-xl text-white">{t.label}{mine && <span className="ml-2 align-middle text-[0.6rem] uppercase tracking-wider text-gold-300">sua</span>}</p>
                  <p className="mt-0.5 truncate text-xs text-mist" data-testid="waiter-name">{t.waiterName ? `Garçom: ${t.waiterName}` : "Sem garçom"}</p>
                  {calling ? (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#f0b2a8]">{CALL_SHORT[calling.kind]} · há {elapsed(calling.createdAt, now)}</p>
                  ) : coming ? (
                    <p className="mt-1 text-xs uppercase tracking-wider text-[#f3d29b]">{CALL_SHORT[coming.kind]} · a caminho</p>
                  ) : (
                    <p className="mt-1 text-xs uppercase tracking-wider text-mist">{TONE_LABEL[k]}</p>
                  )}
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

      <aside aria-label="Pedidos e chamadas da mesa" className="lg:sticky lg:top-28 lg:max-h-[calc(100svh-8rem)] lg:self-start lg:overflow-y-auto">
        {!selTable ? (
          <p className="rounded-2xl border border-dashed border-kau-800 p-8 text-center text-mist">Escolha uma mesa para ver as chamadas, os pedidos e o histórico.</p>
        ) : (
          <div>
            <h2 className="font-display text-2xl text-white">{selTable.label}</h2>
            <p className="mb-3 text-sm text-mist">{selTable.waiterName ? `Garçom: ${selTable.waiterName}` : "Sem garçom atribuído"}</p>
            <TableBill tableId={selTable.id} tableLabel={selTable.label} orders={orders.filter((o) => o.tableId === selTable.id)} />
            {calls.some((c) => c.tableId === selTable.id) && (
              <div className="mb-4 space-y-2">
                {calls.filter((c) => c.tableId === selTable.id).slice(0, 6).map((c) => <CallCard key={c.id} call={c} />)}
              </div>
            )}
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
