"use client";
import { useState } from "react";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { useLive } from "./LiveOrders";
import { OrderCard, STATUS_STYLE } from "./OrderCard";
import { DiamondMark } from "@/components/brand/DiamondPattern";

const COLS: OrderStatus[] = ["pending", "preparing", "done"];

export function OrdersBoard() {
  const { orders, loaded } = useLive();
  const [tab, setTab] = useState<OrderStatus>("pending");
  const by = (s: OrderStatus) => orders.filter((o) => o.status === s);
  // concluídos: só os mais recentes aqui; o histórico completo está em "Mesas"
  const list = (s: OrderStatus) => (s === "done" ? by(s).slice(0, 20) : [...by(s)].reverse());

  if (!loaded) return <p className="py-20 text-center text-mist">A carregar pedidos…</p>;

  return (
    <div>
      {/* telemóvel: separadores */}
      <div role="tablist" aria-label="Estado" className="mb-4 grid grid-cols-3 gap-2 lg:hidden">
        {COLS.map((s) => (
          <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)}
            className={`rounded-xl px-2 py-3 text-sm ${tab === s ? "bg-gold text-kau-950" : "bg-kau-900 text-mist"}`}>
            {STATUS_LABEL[s]} <span className="font-bold">{by(s).length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {COLS.map((s) => (
          <section key={s} aria-label={STATUS_LABEL[s]} className={tab === s ? "block" : "hidden lg:block"}>
            <h2 className="mb-3 hidden items-center justify-between lg:flex">
              <span className="flex items-center gap-2 font-display text-xl text-white">
                <span className={`h-3 w-3 rounded-full ${STATUS_STYLE[s].bar}`} aria-hidden />
                {STATUS_LABEL[s]}
              </span>
              <span className="rounded-full bg-kau-900 px-3 py-1 text-sm text-mist">{by(s).length}</span>
            </h2>
            <div className="space-y-4">
              {list(s).map((o) => <OrderCard key={o.id} order={o} />)}
              {by(s).length === 0 && (
                <div className="rounded-2xl border border-dashed border-kau-800 py-12 text-center text-sm text-mist">
                  <DiamondMark className="mx-auto mb-3 text-gold/40" size={28} />
                  {s === "pending" ? "Sem pedidos pendentes." : s === "preparing" ? "Nada em preparação." : "Sem pedidos concluídos hoje."}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
