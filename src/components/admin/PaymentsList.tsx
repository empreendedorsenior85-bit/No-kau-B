"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidPaymentAction } from "@/app/admin/actions";
import type { Payment } from "@/lib/payments";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL, formatOrderNumber } from "@/lib/types";

const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

function Row({ p }: { p: Payment }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const voided = p.status === "voided";
  return (
    <li className={`rounded-2xl border border-kau-800 bg-kau-900 p-4 ${voided ? "opacity-60" : ""}`} data-testid={`payment-${p.id}`} data-status={p.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl text-white">{formatXOF(p.amount)} · {PAYMENT_LABEL[p.method]}</p>
          <p className="text-xs text-mist">{when(p.createdAt)} · {p.tableLabel} · recebido por {p.receivedBy}</p>
          <p className="mt-1 text-xs text-mist">Pedidos: {p.orders.length ? p.orders.map((o) => formatOrderNumber(o.number, o.origin)).join(", ") : "—"}</p>
          {p.tendered != null && <p className="text-xs text-mist">Entregue {formatXOF(p.tendered)} · troco {formatXOF(p.change ?? 0)}</p>}
          {p.note && <p className="text-xs text-mist">Nota: {p.note}</p>}
          {voided && <p className="mt-1 text-xs text-[#e48a7d]">ANULADO {p.voidedAt ? when(p.voidedAt) : ""} por {p.voidedBy}: {p.voidReason}</p>}
        </div>
        {!voided && <button onClick={() => setOpen((v) => !v)} className="rounded-full border border-kau-800 px-3 py-2 text-xs text-mist hover:text-white">Anular…</button>}
      </div>
      {open && !voided && (
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`vr-${p.id}`}>Motivo</label>
          <input id={`vr-${p.id}`} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Motivo (obrigatório) — ex.: valor errado, devolução"
            className="h-10 min-w-0 flex-1 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white" />
          <button disabled={pending || reason.trim().length < 3} className="rounded-full bg-[#e48a7d] px-4 text-sm font-medium text-kau-950 disabled:opacity-40"
            onClick={() => start(async () => { const r = await voidPaymentAction(p.id, reason); if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.message ?? "Erro."); })}>
            Confirmar anulação
          </button>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm text-[#e48a7d]">{err}</p>}
    </li>
  );
}

export function PaymentsList({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) return <p className="rounded-2xl border border-dashed border-kau-800 p-8 text-center text-mist">Sem pagamentos neste período.</p>;
  return <ul className="space-y-3" data-testid="payments-list">{payments.map((p) => <Row key={p.id} p={p} />)}</ul>;
}
