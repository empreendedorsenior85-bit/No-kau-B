"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLive } from "./LiveOrders";
import { StatusBadge } from "./OrderCard";
import { CALL_SHORT, CALL_STATUS_LABEL, formatOrderNumber } from "@/lib/types";
import { formatXOF } from "@/lib/format";
import { useNow } from "@/lib/use-client-value";

const KEY = "nk-notif-read";
const subscribe = (cb: () => void) => { window.addEventListener("storage", cb); window.addEventListener("nk-notif", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("nk-notif", cb); }; };
const readAtSnapshot = () => { try { return localStorage.getItem(KEY) ?? "0"; } catch { return "0"; } };

/** Centro de notificações: pedidos novos desde a última vez que abriu + pedidos à espera há demasiado tempo. */
export function NotificationBell() {
  const { orders, loaded, openCalls } = useLive();
  const readAt = Number(useSyncExternalStore(subscribe, readAtSnapshot, () => "0"));
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const fresh = orders.filter((o) => +new Date(o.createdAt) > readAt);
  const late = orders.filter((o) => o.status === "pending" && now && now - +new Date(o.createdAt) > 10 * 60_000);
  const waitingCalls = openCalls.filter((c) => c.status === "open");
  const count = loaded ? new Set([...fresh.map((o) => o.id), ...late.map((o) => o.id), ...waitingCalls.map((c) => c.id)]).size : 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => {
    setOpen((v) => !v);
    if (!open) { try { localStorage.setItem(KEY, String(Date.now())); window.dispatchEvent(new Event("nk-notif")); } catch {} }
  };

  const items = orders.slice(0, 10);
  const lateIds = new Set(late.map((o) => o.id));

  return (
    <div ref={box} className="relative">
      <button onClick={toggle} aria-expanded={open} aria-label={`Notificações${count ? `: ${count} por ver` : ""}`} data-testid="bell"
        className="relative grid h-10 w-10 place-items-center rounded-full border border-kau-800 text-mist hover:text-white">
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0" /></svg>
        {count > 0 && <span data-testid="bell-count" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#e0a64a] px-1 text-[0.65rem] font-bold text-kau-950">{count}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notificações" className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-kau-800 bg-kau-950 p-3 shadow-2xl" data-testid="bell-panel">
          <p className="px-2 pb-2 font-display text-lg text-white">Notificações</p>
          {openCalls.length > 0 && (
            <ul className="mb-2 space-y-1" data-testid="bell-calls">
              {openCalls.map((c) => (
                <li key={c.id}>
                  <Link href="/admin/mesas" onClick={() => setOpen(false)} className={`block rounded-xl px-2 py-2 text-sm ${c.status === "open" ? "bg-[#e48a7d]/15 text-[#f0b2a8]" : "bg-[#e0a64a]/10 text-[#f3d29b]"}`}>
                    {c.status === "open" ? "🔔 " : "↪ "}{c.tableLabel} · {CALL_SHORT[c.kind]} · {CALL_STATUS_LABEL[c.status]}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {items.length === 0 ? <p className="px-2 py-6 text-center text-sm text-mist">Sem pedidos recentes.</p> : (
            <ul className="max-h-80 divide-y divide-kau-800 overflow-y-auto">
              {items.map((o) => (
                <li key={o.id}>
                  <Link href="/admin/pedidos" onClick={() => setOpen(false)} className="flex items-start justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-kau-900">
                    <span className="min-w-0 text-sm">
                      <span className="block text-white">{lateIds.has(o.id) ? "⏱ À espera: " : "Novo pedido "}{formatOrderNumber(o.number, o.origin)} · {o.tableLabel}</span>
                      <span className="text-xs text-mist">{new Date(o.createdAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" })} · {formatXOF(o.total)}</span>
                    </span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="px-2 pt-2 text-[0.7rem] text-mist">Os avisos só aparecem com o painel aberto.</p>
        </div>
      )}
    </div>
  );
}
