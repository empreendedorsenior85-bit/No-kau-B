"use client";
import { useMemo, useState, useTransition } from "react";
import { confirmPaymentAction } from "@/app/admin/actions";
import { newKey } from "@/lib/cart";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL, PAYMENT_METHODS, formatOrderNumber, type Order, type PaymentMethod } from "@/lib/types";
import { useLive } from "./LiveOrders";

/**
 * Conta da mesa: pedidos por pagar e confirmação do pagamento recebido EM MÃO.
 * O valor é calculado no servidor a partir dos pedidos escolhidos; aqui é só para mostrar.
 */
export function TableBill({ tableId, tableLabel, orders }: { tableId: number; tableLabel: string; orders: Order[] }) {
  const { me, refresh } = useLive();
  const canConfirm = me.role === "admin" || me.role === "gerente";
  const unpaid = useMemo(() => orders.filter((o) => !o.paid && !o.isTest).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)), [orders]);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [tendered, setTendered] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(() => newKey());
  const [p, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const chosen = unpaid.filter((o) => !unchecked.has(o.id));
  const total = chosen.reduce((n, o) => n + o.total, 0);
  const given = Number(tendered.replace(/\D/g, "")) || 0;
  const change = method === "cash" && given ? given - total : null;

  if (unpaid.length === 0) {
    return msg.ok
      ? <p role="status" className="mb-4 rounded-2xl border border-[#7fc290]/40 bg-[#7fc290]/10 p-3 text-sm text-[#a9dbb4]" data-testid="bill-paid">{msg.ok}</p>
      : null;
  }

  const confirm = () => start(async () => {
    setMsg({});
    try {
      const r = await confirmPaymentAction({ tableId, orderIds: chosen.map((o) => o.id), method, tendered: method === "cash" && given ? given : null, note: note || null, key });
      if (r.ok) {
        setMsg({ ok: `✓ Pagamento de ${formatXOF(r.payment.amount)} confirmado (${PAYMENT_LABEL[r.payment.method]})${r.payment.change ? ` — troco ${formatXOF(r.payment.change)}` : ""}.` });
        setKey(newKey()); setMethod(""); setTendered(""); setNote(""); setUnchecked(new Set());
        refresh();
      } else setMsg({ error: r.message });
    } catch { setMsg({ error: "Sem ligação — o pagamento NÃO foi registado. Tente de novo (não cobra duas vezes)." }); }
  });

  return (
    <section aria-labelledby={`conta-${tableId}`} className="mb-4 rounded-2xl border border-gold/50 bg-gold/5 p-4" data-testid="table-bill">
      <h3 id={`conta-${tableId}`} className="font-display text-xl text-white">Conta da {tableLabel}</h3>
      <ul className="mt-2 space-y-1.5">
        {unpaid.map((o) => (
          <li key={o.id}>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-white">
                <input type="checkbox" className="h-4 w-4 accent-[#a9862c]" checked={!unchecked.has(o.id)} disabled={!canConfirm || p}
                  onChange={(e) => setUnchecked((s) => { const n = new Set(s); if (e.target.checked) n.delete(o.id); else n.add(o.id); return n; })} />
                {formatOrderNumber(o.number, o.origin)} · {o.items.reduce((n, i) => n + i.quantity, 0)} artigo(s)
              </span>
              <span className="text-gold-300">{formatXOF(o.total)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between border-t border-kau-800 pt-2 font-display text-xl text-white" data-testid="bill-total">
        <span>A pagar</span><span className="text-gold-300">{formatXOF(total)}</span>
      </p>
      {!canConfirm ? (
        <p className="mt-2 text-xs text-mist">O pagamento é confirmado pelo gerente.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <fieldset>
            <legend className="text-xs uppercase tracking-wider text-mist">Método (recebido em mão)</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <label key={m} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 py-1.5 text-sm ${method === m ? "border-gold bg-gold text-kau-950" : "border-kau-800 text-mist"}`}>
                  <input type="radio" name={`method-${tableId}`} value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                  {PAYMENT_LABEL[m]}
                </label>
              ))}
            </div>
          </fieldset>
          {method === "cash" && (
            <label className="block text-sm text-mist">Valor entregue pelo cliente (opcional)
              <input inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(total)} data-testid="bill-tendered"
                className="mt-1 h-11 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-base text-white" />
              {change != null && <span className={`mt-1 block ${change < 0 ? "text-[#e48a7d]" : "text-[#a9dbb4]"}`} data-testid="bill-change">{change < 0 ? `Faltam ${formatXOF(-change)}` : `Troco: ${formatXOF(change)}`}</span>}
            </label>
          )}
          <label className="block text-sm text-mist">Nota (opcional)
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Ex.: ref. Orange Money 123456"
              className="mt-1 h-11 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-base text-white" />
          </label>
          <button onClick={confirm} disabled={p || !method || chosen.length === 0 || (change != null && change < 0)} data-testid="bill-confirm"
            className="h-12 w-full rounded-full bg-gold px-4 text-sm font-medium text-kau-950 disabled:opacity-40">
            {p ? "A registar…" : `Confirmar pagamento de ${formatXOF(total)}`}
          </button>
        </div>
      )}
      {msg.error && <p role="alert" className="mt-2 text-sm text-[#e48a7d]">{msg.error}</p>}
      {msg.ok && <p role="status" className="mt-2 text-sm text-[#a9dbb4]" data-testid="bill-paid">{msg.ok}</p>}
    </section>
  );
}
