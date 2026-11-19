"use client";
import { useState, useTransition } from "react";
import { changeStatusAction } from "@/app/admin/actions";
import { NEXT_STATUS, PREV_STATUS, STATUS_LABEL, formatOrderNumber, type Order, type OrderStatus } from "@/lib/types";
import { formatXOF } from "@/lib/format";
import { useLive } from "./LiveOrders";
import { OrderPay } from "./OrderPay";

export const STATUS_STYLE: Record<OrderStatus, { badge: string; bar: string; icon: string }> = {
  pending: { badge: "bg-[#e0a64a]/15 text-[#e0a64a] ring-[#e0a64a]/50", bar: "bg-[#e0a64a]", icon: "●" },
  preparing: { badge: "bg-[#5b9bd5]/15 text-[#8ab9e6] ring-[#5b9bd5]/50", bar: "bg-[#5b9bd5]", icon: "◐" },
  done: { badge: "bg-ok/15 text-[#7fc290] ring-ok/50", bar: "bg-ok", icon: "✓" },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wider ring-1 ${s.badge}`}>
      <span aria-hidden>{s.icon}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

const NEXT_LABEL: Record<OrderStatus, string> = { pending: "Iniciar preparação", preparing: "Marcar concluído", done: "" };

export function OrderCard({ order, compact }: { order: Order; compact?: boolean }) {
  const { unseen, acknowledge, upsert } = useLive();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const isNew = unseen.has(order.id);
  const next = NEXT_STATUS[order.status];
  const prev = PREV_STATUS[order.status];

  const move = (to: OrderStatus) => {
    setErr(null);
    start(async () => {
      try {
        const r = await changeStatusAction(order.id, order.status, to);
        if (r.ok) { upsert(r.order); acknowledge(order.id); } else setErr(r.message);
      } catch {
        setErr("Falha de ligação. Tente novamente.");
      }
    });
  };

  return (
    <article
      onClick={() => isNew && acknowledge(order.id)}
      data-testid={`order-${order.origin === "local" ? "L" : ""}${order.number}`}
      data-status={order.status}
      className={`relative overflow-hidden rounded-2xl border bg-kau-900 ${isNew ? "animate-[nk-pulse_1.2s_ease-in-out_infinite] border-[#e0a64a]" : "border-kau-800"}`}
    >
      <div className={`h-1 ${STATUS_STYLE[order.status].bar}`} />
      <div className="p-4">
        {isNew && <p className="mb-2 inline-block rounded-full bg-[#e0a64a] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-kau-950">Novo</p>}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-2xl text-white">{formatOrderNumber(order.number, order.origin)}</p>
            <p className="font-display text-lg text-gold-300">{order.tableLabel}</p>
          </div>
          <div className="text-right">
            <StatusBadge status={order.status} />
            <p className="mt-1 text-xs text-mist">{fmtTime(order.createdAt)}</p>
          </div>
        </div>
        {order.paid && <p data-testid="order-paid" className="mt-2 mr-2 inline-block rounded-full bg-ok/15 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-[#7fc290]">Pago</p>}
        {!order.paid && !order.isTest && order.status === "done" && <p data-testid="order-unpaid" className="mt-2 mr-2 inline-block rounded-full bg-[#e0a64a]/15 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-[#e0a64a]">Por cobrar</p>}
        {order.isTest && <p className="mt-2 inline-block rounded-full border border-dashed border-gold-300/70 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-gold-300">Teste (demonstração)</p>}

        <ul className="mt-3 space-y-1.5 border-t border-kau-800 pt-3">
          {order.items.map((it, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium text-white">{it.quantity}×</span> <span className="text-white">{it.name}</span>
              {it.note && <p className="ml-6 text-sm italic text-[#e0a64a]">↳ {it.note}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-kau-800 pt-3 font-display text-lg text-white">
          <span>Total</span><span className="text-gold-300">{formatXOF(order.total)}</span>
        </p>

        {!compact && (next || prev) && (
          <div className="mt-3 flex gap-2">
            {next && (
              <button
                onClick={(e) => { e.stopPropagation(); move(next); }}
                disabled={pending}
                className="h-12 flex-1 rounded-full bg-gold px-4 text-sm font-medium text-kau-950 disabled:opacity-50 active:scale-[0.98]"
              >
                {pending ? "A atualizar…" : NEXT_LABEL[order.status]}
              </button>
            )}
            {prev && (
              <button
                onClick={(e) => { e.stopPropagation(); move(prev); }}
                disabled={pending}
                className="h-12 rounded-full border border-kau-800 px-4 text-sm text-mist hover:text-white disabled:opacity-50"
                aria-label={`Voltar para ${STATUS_LABEL[prev]}`}
              >
                ↩ {STATUS_LABEL[prev]}
              </button>
            )}
          </div>
        )}
        {!compact && <OrderPay order={order} />}
        {err && <p role="alert" className="mt-2 text-sm text-[#e48a7d]">{err}</p>}
      </div>
    </article>
  );
}
