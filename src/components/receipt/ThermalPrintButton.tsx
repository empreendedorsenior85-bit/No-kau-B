"use client";
import { useState, useTransition } from "react";
import { printReceiptAction } from "@/app/admin/actions";
import { newKey } from "@/lib/cart";

/** Imprimir este recibo numa impressora térmica do restaurante (só no servidor local). */
export function ThermalPrintButton({ paymentId, printers }: { paymentId: string; printers: { id: number; name: string; station: string }[] }) {
  const [printer, setPrinter] = useState(String(printers.find((p) => p.station === "counter")?.id ?? printers[0]?.id ?? ""));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!printers.length) return <p className="text-xs text-mist">Sem impressoras ativas (Impressoras → Adicionar).</p>;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="thermal-print">
      <label className="sr-only" htmlFor="thermal-printer">Impressora</label>
      <select id="thermal-printer" value={printer} onChange={(e) => setPrinter(e.target.value)} className="h-10 rounded-full border border-kau-800 bg-kau-950 px-3 text-sm text-white">
        {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" disabled={pending} data-testid="thermal-print-button"
        onClick={() => start(async () => { const r = await printReceiptAction(paymentId, Number(printer), newKey()); setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.ok ?? "" }); })}
        className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-kau-950 disabled:opacity-50">
        {pending ? "A enviar…" : "Imprimir no talão"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`w-full text-center text-sm ${msg.ok ? "text-[#7fc290]" : "text-[#e48a7d]"}`}>{msg.text}</p>}
    </div>
  );
}
