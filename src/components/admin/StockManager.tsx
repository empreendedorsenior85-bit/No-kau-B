"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StockLevel, StockResult } from "@/lib/stock";
import { countStockAction, moveStockAction, stockSettingsAction, trackStockAction, untrackStockAction } from "@/app/admin/stock-actions";
import { useLive } from "./LiveOrders";

const STATUS: Record<StockLevel["status"], { label: string; cls: string }> = {
  out: { label: "Esgotado", cls: "bg-[#e48a7d]/15 text-[#f0b2a8] ring-[#e48a7d]/50" },
  low: { label: "A acabar", cls: "bg-[#e0a64a]/15 text-[#f3d29b] ring-[#e0a64a]/50" },
  ok: { label: "OK", cls: "bg-ok/15 text-[#7fc290] ring-ok/50" },
};
const input = "h-11 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white placeholder:text-mist/60";
type Mode = "entrada" | "saida" | "contagem" | "definicoes";

/**
 * Lista de stock em tempo real (canal do painel) + registo de produtos e movimentos.
 * Depois de cada alteração (minha ou de outra pessoa) a página recarrega os dados do servidor — o histórico e a lista
 * de produtos por registar ficam sempre certos.
 */
export function StockManager({ initial, untracked, readOnly }: { initial: StockLevel[]; untracked: { id: number; name: string; category: string }[]; readOnly: boolean }) {
  const { stock, loaded } = useLive();
  const router = useRouter();
  // base: a lista do servidor (produtos registados); quantidades: a versão mais recente (servidor ou tempo real)
  const levels = useMemo(() => {
    const live = new Map(stock.map((l) => [l.menuItemId, l]));
    const rank = { out: 0, low: 1, ok: 2 } as const;
    return initial.map((i) => { const lv = live.get(i.menuItemId); return lv && lv.rev > i.rev ? lv : i; })
      .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, "pt"));
  }, [initial, stock]);
  const [filter, setFilter] = useState<"all" | "alert">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: number; mode: Mode } | null>(null);

  // outra pessoa (ou uma venda) mudou o stock → atualiza o histórico
  const maxRev = useMemo(() => stock.reduce((n, l) => Math.max(n, l.rev), 0), [stock]);
  const firstRev = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (firstRev.current === null) { firstRev.current = maxRev; return; } // primeira carga do canal: nada mudou
    if (maxRev <= firstRev.current) return;
    firstRev.current = maxRev;
    const t = setTimeout(() => router.refresh(), 600);
    return () => clearTimeout(t);
  }, [maxRev, loaded, router]);

  const out = levels.filter((l) => l.status === "out"), low = levels.filter((l) => l.status === "low");
  const shown = levels.filter((l) => (filter === "all" || l.status !== "ok") && (!q || l.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stock-summary">
        {[
          { k: "Produtos controlados", v: levels.length, cls: "text-white", id: "total" },
          { k: "Esgotados", v: out.length, cls: out.length ? "text-[#f0b2a8]" : "text-white", id: "out" },
          { k: "A acabar (≤ mínimo)", v: low.length, cls: low.length ? "text-[#f3d29b]" : "text-white", id: "low" },
          { k: "Com stock", v: levels.length - out.length - low.length, cls: "text-white", id: "ok" },
        ].map((c) => (
          <div key={c.id} className="rounded-2xl border border-kau-800 bg-kau-900 p-4">
            <p className="text-xs uppercase tracking-wider text-mist">{c.k}</p>
            <p className={`mt-1 font-display text-3xl ${c.cls}`} data-testid={`stock-count-${c.id}`}>{c.v}</p>
          </div>
        ))}
      </section>

      {(out.length > 0 || low.length > 0) && (
        <div role="alert" data-testid="stock-alert" className="rounded-2xl border border-[#e48a7d]/50 bg-[#e48a7d]/10 p-4 text-sm text-[#f0b2a8]">
          <p className="font-semibold">⚠ Reposição necessária</p>
          <ul className="mt-1 space-y-0.5">
            {[...out, ...low].map((l) => (
              <li key={l.menuItemId}>{l.name}: <strong>{l.quantity}</strong> {l.status === "out" ? "— esgotado" : `(mínimo ${l.minQuantity})`}{l.soldoutByStock ? " · retirado do menu automaticamente" : ""}</li>
            ))}
          </ul>
        </div>
      )}

      {!readOnly && <TrackForm untracked={untracked} onDone={() => router.refresh()} />}

      <section aria-labelledby="produtos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="produtos" className="font-display text-2xl text-white">Produtos</h2>
          <div className="flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar produto" aria-label="Procurar produto" className={`${input} w-48`} />
            <div className="flex rounded-full border border-kau-800 p-1 text-sm">
              {(["all", "alert"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} data-testid={`stock-filter-${f}`}
                  className={`rounded-full px-4 py-1.5 ${filter === f ? "bg-gold text-kau-950" : "text-mist hover:text-white"}`}>
                  {f === "all" ? "Todos" : `Alertas (${out.length + low.length})`}
                </button>
              ))}
            </div>
          </div>
        </div>
        {levels.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-kau-800 p-8 text-center text-sm text-mist">Ainda não há produtos com stock controlado. Registe o primeiro acima.</p>
        ) : shown.length === 0 ? (
          <p className="mt-4 text-sm text-mist">Nenhum produto com este filtro.</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3" data-testid="stock-list">
            {shown.map((l) => (
              <StockCard key={l.menuItemId} l={l} readOnly={readOnly} mode={open?.id === l.menuItemId ? open.mode : null}
                setMode={(m) => setOpen(m ? { id: l.menuItemId, mode: m } : null)} onDone={() => router.refresh()} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TrackForm({ untracked, onDone }: { untracked: { id: number; name: string; category: string }[]; onDone: () => void }) {
  const [item, setItem] = useState("");
  const [initial, setInitial] = useState("");
  const [min, setMin] = useState("");
  const [auto, setAuto] = useState(true);
  const [p, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({});
    start(async () => {
      try {
        const r = await trackStockAction({ itemId: Number(item), initial, min, autoSoldout: auto });
        if (r.ok) { setMsg({ ok: `${r.level.name}: stock registado (${r.level.quantity}).` }); setItem(""); setInitial(""); setMin(""); onDone(); }
        else setMsg({ error: r.message });
      } catch { setMsg({ error: "Falha de ligação. Tente novamente." }); }
    });
  };
  return (
    <details className="rounded-2xl border border-kau-800 bg-kau-900 p-4" data-testid="stock-track">
      <summary className="cursor-pointer font-display text-xl text-white">+ Registar produto no stock</summary>
      {untracked.length === 0 ? <p className="mt-3 text-sm text-mist">Todos os produtos ativos do menu já têm stock registado. Para um produto novo, crie-o primeiro em Menu.</p> : (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <label className="text-sm text-mist sm:col-span-2">Produto do menu
            <select required value={item} onChange={(e) => setItem(e.target.value)} name="item" className={`${input} mt-1`}>
              <option value="">Escolher…</option>
              {untracked.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.category}</option>)}
            </select>
          </label>
          <label className="text-sm text-mist">Quantidade atual
            <input required inputMode="numeric" pattern="[0-9]*" value={initial} onChange={(e) => setInitial(e.target.value)} name="initial" className={`${input} mt-1`} placeholder="ex.: 24" />
          </label>
          <label className="text-sm text-mist">Stock mínimo
            <input required inputMode="numeric" pattern="[0-9]*" value={min} onChange={(e) => setMin(e.target.value)} name="min" className={`${input} mt-1`} placeholder="ex.: 6" />
          </label>
          <button disabled={p} className="h-11 rounded-full bg-gold px-5 text-sm font-medium text-kau-950 disabled:opacity-50" data-testid="stock-track-submit">{p ? "A registar…" : "Registar"}</button>
          <label className="flex items-center gap-2 text-sm text-mist sm:col-span-2 lg:col-span-5">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[#c9a24a]" />
            Esgotado automático: a zero, tirar o produto do menu (volta quando houver entrada)
          </label>
        </form>
      )}
      {msg.ok && <p role="status" className="mt-3 text-sm text-[#a9dbb4]">{msg.ok}</p>}
      {msg.error && <p role="alert" className="mt-3 text-sm text-[#e48a7d]">{msg.error}</p>}
    </details>
  );
}

function StockCard({ l, readOnly, mode, setMode, onDone }: { l: StockLevel; readOnly: boolean; mode: Mode | null; setMode: (m: Mode | null) => void; onDone: () => void }) {
  const s = STATUS[l.status];
  const pct = l.minQuantity > 0 ? Math.max(0, Math.min(100, (l.quantity / (l.minQuantity * 3)) * 100)) : l.quantity > 0 ? 100 : 0;
  return (
    <li className={`rounded-2xl border bg-kau-900 p-4 ${l.status === "out" ? "border-[#e48a7d]/60" : l.status === "low" ? "border-[#e0a64a]/60" : "border-kau-800"}`}
      data-testid={`stock-${l.menuItemId}`} data-status={l.status} data-qty={l.quantity}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-xl text-white" title={l.name}>{l.name}</p>
          <p className="text-xs text-mist">{l.category} · mínimo {l.minQuantity}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wider ring-1 ${s.cls}`}>{s.label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={`font-sans text-4xl font-semibold tabular-nums ${l.quantity <= 0 ? "text-[#f0b2a8]" : "text-white"}`} data-testid="stock-qty">{l.quantity}</p>
        <p className="text-right text-xs text-mist">
          No menu: {l.available ? <span className="text-[#a9dbb4]">disponível</span> : <span className="text-[#f0b2a8]">{l.soldoutByStock ? "esgotado (automático)" : "indisponível"}</span>}
          {!l.autoSoldout && <span className="block">esgotado automático desligado</span>}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-kau-800" aria-hidden><div className={`h-full ${l.status === "out" ? "bg-[#e48a7d]" : l.status === "low" ? "bg-[#e0a64a]" : "bg-ok"}`} style={{ width: `${pct}%` }} /></div>
      {l.quantity < 0 && <p className="mt-2 text-xs text-[#f0b2a8]">Stock negativo: houve vendas sem stock registado. Faça uma contagem.</p>}
      {!readOnly && (
        <>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {([["entrada", "+ Entrada"], ["saida", "− Saída"], ["contagem", "Contagem"], ["definicoes", "Mínimo / opções"]] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => setMode(mode === m ? null : m)} aria-expanded={mode === m} data-testid={`stock-btn-${m}`}
                className={`min-h-10 rounded-full px-3.5 py-1.5 ${mode === m ? "bg-gold text-kau-950" : m === "entrada" ? "border border-[#7fc290]/60 text-[#a9dbb4]" : "border border-kau-800 text-mist hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
          {mode && <StockForm key={mode} l={l} mode={mode} onClose={() => setMode(null)} onDone={onDone} />}
        </>
      )}
    </li>
  );
}

function StockForm({ l, mode, onClose, onDone }: { l: StockLevel; mode: Mode; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState(mode === "definicoes" ? String(l.minQuantity) : "");
  const [reason, setReason] = useState("");
  const [auto, setAuto] = useState(l.autoSoldout);
  const [p, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { upsertStock, removeStock } = useLive();

  const run = (fn: () => Promise<StockResult>) => start(async () => {
    setErr(null);
    try {
      const r = await fn();
      if (r.ok) { upsertStock(r.level); onClose(); onDone(); } else setErr(r.message);
    } catch { setErr("Falha de ligação. Tente novamente."); }
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "entrada" || mode === "saida") run(() => moveStockAction({ itemId: l.menuItemId, kind: mode, qty, reason }));
    else if (mode === "contagem") run(() => countStockAction({ itemId: l.menuItemId, counted: qty, reason }));
    else run(() => stockSettingsAction({ itemId: l.menuItemId, min: qty, autoSoldout: auto }));
  };
  const remove = () => start(async () => {
    setErr(null);
    try { const r = await untrackStockAction(l.menuItemId); if (r.ok) { removeStock(l.menuItemId); onClose(); onDone(); } else setErr(r.message ?? "Não foi possível."); }
    catch { setErr("Falha de ligação. Tente novamente."); }
  });

  const label = mode === "entrada" ? "Quantidade que entrou" : mode === "saida" ? "Quantidade que saiu" : mode === "contagem" ? "Quantidade contada (real)" : "Stock mínimo";
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl border border-kau-800 bg-kau-950 p-3" data-testid="stock-form" data-mode={mode}>
      <label className="block text-xs text-mist">{label}
        <input autoFocus required inputMode="numeric" pattern="[0-9]*" value={qty} onChange={(e) => setQty(e.target.value)} name="qty" className={`${input} mt-1`} />
      </label>
      {mode !== "definicoes" ? (
        <label className="block text-xs text-mist">
          {mode === "saida" ? "Motivo (obrigatório)" : mode === "contagem" ? "Motivo (opcional)" : "Fornecedor / nota (opcional)"}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} name="reason" required={mode === "saida"}
            placeholder={mode === "saida" ? "ex.: quebra, validade, consumo interno" : mode === "contagem" ? "ex.: inventário semanal" : "ex.: compra no fornecedor"} className={`${input} mt-1`} />
        </label>
      ) : (
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[#c9a24a]" name="auto" />
          Esgotado automático no menu
        </label>
      )}
      {mode === "contagem" && qty && /^\d+$/.test(qty) && <p className="text-xs text-mist">Diferença: {Number(qty) - l.quantity > 0 ? "+" : ""}{Number(qty) - l.quantity}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={p} className="h-11 flex-1 rounded-full bg-gold px-4 text-sm font-medium text-kau-950 disabled:opacity-50" data-testid="stock-form-submit">
          {p ? "A guardar…" : mode === "entrada" ? "Registar entrada" : mode === "saida" ? "Registar saída" : mode === "contagem" ? "Acertar stock" : "Guardar"}
        </button>
        <button type="button" onClick={onClose} className="h-11 rounded-full border border-kau-800 px-4 text-sm text-mist">Cancelar</button>
      </div>
      {mode === "definicoes" && (
        confirmRemove ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
            Deixar de controlar o stock deste produto? O histórico fica guardado.
            <button type="button" onClick={remove} disabled={p} className="rounded-full border border-[#e48a7d]/60 px-3 py-1.5 text-[#f0b2a8]" data-testid="stock-untrack-confirm">Sim, deixar de controlar</button>
          </div>
        ) : <button type="button" onClick={() => setConfirmRemove(true)} className="text-xs text-mist underline underline-offset-4" data-testid="stock-untrack">Deixar de controlar o stock</button>
      )}
      {err && <p role="alert" className="text-sm text-[#e48a7d]">{err}</p>}
    </form>
  );
}
