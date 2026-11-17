"use client";
import { useTransition, useState } from "react";
import { setCallStatusAction } from "@/app/admin/actions";
import { formatXOF } from "@/lib/format";
import { CALL_SHORT, CALL_STATUS_LABEL, type ServiceCall } from "@/lib/types";
import { useNow } from "@/lib/use-client-value";
import { useLive } from "./LiveOrders";

const ICON = { waiter: "🙋", manager: "👔", bill: "🧾" } as const;

export function elapsed(fromIso: string, now: number) {
  if (!now) return "";
  const s = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

/** Uma chamada de cliente, com as ações "A caminho" e "Resolvido" (toda a equipa). */
export function CallCard({ call, compact }: { call: ServiceCall; compact?: boolean }) {
  const { upsertCall, me } = useLive();
  const now = useNow(5000);
  const [p, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const act = (to: "ack" | "done") => start(async () => {
    setErr(null);
    try {
      const r = await setCallStatusAction(call.id, to);
      if (r.ok) upsertCall(r.call); else setErr(r.message);
    } catch { setErr("Sem ligação. Tente de novo."); }
  });
  const mine = me.role === "garcom" && call.waiterId === me.id;
  const open = call.status === "open";
  const active = open || call.status === "ack";
  const late = open && now && now - Date.parse(call.createdAt) > 120_000;

  return (
    <article data-testid={`call-${call.id}`} data-kind={call.kind} data-status={call.status}
      className={`rounded-2xl border p-3 ${open ? `border-[#e48a7d] bg-[#e48a7d]/10 ${late ? "animate-pulse" : ""}` : call.status === "ack" ? "border-[#e0a64a]/60 bg-[#e0a64a]/5" : "border-kau-800 bg-kau-900 opacity-70"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg text-white">
            <span aria-hidden>{ICON[call.kind]} </span>{call.tableLabel} · {CALL_SHORT[call.kind]}
            {mine && <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 align-middle text-[0.65rem] uppercase tracking-wider text-gold-300">A sua mesa</span>}
          </p>
          <p className="text-xs text-mist">
            {CALL_STATUS_LABEL[call.status]}
            {active ? ` há ${elapsed(call.createdAt, now)}` : ""}
            {call.ackBy && call.status !== "open" ? ` · ${call.ackBy}` : ""}
          </p>
          {call.kind === "bill" && call.amount != null && <p className="mt-1 text-sm text-gold-300">Total da mesa: {formatXOF(call.amount)}</p>}
        </div>
      </div>
      {active && !compact && (
        <div className="mt-2 flex gap-2">
          {open && <button onClick={() => act("ack")} disabled={p} className="h-10 flex-1 rounded-full border border-gold/60 px-3 text-sm text-gold-300 disabled:opacity-50">A caminho</button>}
          <button onClick={() => act("done")} disabled={p} className="h-10 flex-1 rounded-full bg-gold px-3 text-sm font-medium text-kau-950 disabled:opacity-50">Resolvido</button>
        </div>
      )}
      {err && <p role="alert" className="mt-1 text-xs text-[#e48a7d]">{err}</p>}
    </article>
  );
}
