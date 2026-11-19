"use client";
import { useState, useTransition } from "react";
import { confirmPaymentAction } from "@/app/admin/actions";
import { newKey } from "@/lib/cart";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL, PAYMENT_METHODS, type Order, type PaymentMethod } from "@/lib/types";
import { useLive } from "./LiveOrders";

/**
 * Receber o pagamento de UM pedido diretamente no quadro de Pedidos (Admin e Gerente).
 * Sem isto, um pedido "Concluído" não regista dinheiro e "Pagamentos recebidos" fica a 0.
 * Usa a mesma confirmação da conta da mesa (valor calculado no servidor, recibo numerado, idempotente).
 */
export function OrderPay({ order }: { order: Order }) {
  const { me, refresh } = useLive();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [tendered, setTendered] = useState("");
  const [key, setKey] = useState(() => newKey());
  const [p, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (me.role !== "admin" && me.role !== "gerente") return null;
  if (order.paid || order.isTest) return null;

  const given = Number(tendered.replace(/\D/g, "")) || 0;
  const change = method === "cash" && given ? given - order.total : null;

  const confirm = () => start(async () => {
    setErr(null);
    try {
      const r = await confirmPaymentAction({ tableId: order.tableId, orderIds: [order.id], method, tendered: method === "cash" && given ? given : null, note: null, key });
      if (r.ok) { setOpen(false); setKey(newKey()); refresh(); }
      else setErr(r.message);
    } catch {
      setErr("Falha de ligação. Tente novamente.");
    }
  });

  if (!open) {
    return (
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }} data-testid="order-pay-open"
        className="mt-3 h-11 w-full rounded-full border border-[#7fc290]/60 bg-[#7fc290]/10 px-4 text-sm font-medium text-[#a9dbb4] hover:bg-[#7fc290]/20">
        Receber pagamento · {formatXOF(order.total)}
      </button>
    );
  }
  return (
    <div onClick={(e) => e.stopPropagation()} data-testid="order-pay" className="mt-3 space-y-2 rounded-2xl border border-[#7fc290]/40 bg-[#7fc290]/5 p-3">
      <p className="text-sm text-white">Pagamento de {formatXOF(order.total)}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {PAYMENT_METHODS.map((m) => (
          <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-sm ${method === m ? "border-gold bg-gold/10 text-white" : "border-kau-800 text-mist"}`}>
            <input type="radio" name={`pay-${order.id}`} value={m} checked={method === m} onChange={() => setMethod(m)} className="accent-[#c9a24a]" />
            {PAYMENT_LABEL[m]}
          </label>
        ))}
      </div>
      {method === "cash" && (
        <label className="block text-xs text-mist">Valor entregue (opcional)
          <input inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(order.total)}
            className="mt-1 h-10 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white" />
          {change != null && <span className={`mt-1 block ${change < 0 ? "text-[#e48a7d]" : "text-[#a9dbb4]"}`}>{change < 0 ? `Faltam ${formatXOF(-change)}` : `Troco: ${formatXOF(change)}`}</span>}
        </label>
      )}
      <div className="flex gap-2">
        <button onClick={confirm} disabled={p || !method || (change != null && change < 0)} data-testid="order-pay-confirm"
          className="h-11 flex-1 rounded-full bg-[#7fc290] px-4 text-sm font-semibold text-kau-950 disabled:opacity-50">
          {p ? "A registar…" : "Confirmar pagamento"}
        </button>
        <button onClick={() => { setOpen(false); setErr(null); }} className="h-11 rounded-full border border-kau-800 px-4 text-sm text-mist">Cancelar</button>
      </div>
      {err && <p role="alert" className="text-sm text-[#e48a7d]">{err}</p>}
    </div>
  );
}
