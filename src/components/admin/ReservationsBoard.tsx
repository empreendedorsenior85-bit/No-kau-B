"use client";
import { useState, useTransition } from "react";
import { decideReservationAction } from "@/app/admin/actions";
import { RESERVATION_LABEL, fmtResDate, type Reservation } from "@/lib/types";
import { useLive } from "./LiveOrders";

const STATUS_STYLE = {
  pending: "bg-[#e0a64a]/15 text-[#e0a64a] ring-[#e0a64a]/50",
  approved: "bg-ok/15 text-[#7fc290] ring-ok/50",
  rejected: "bg-[#e48a7d]/15 text-[#e48a7d] ring-[#e48a7d]/50",
  cancelled: "bg-white/5 text-mist ring-white/15",
} as const;

export function ReservationBadge({ status }: { status: Reservation["status"] }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wider ring-1 ${STATUS_STYLE[status]}`}>{RESERVATION_LABEL[status]}</span>;
}

const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

/** Cartão de uma reserva, com Aprovar / Rejeitar (mensagem opcional ao cliente) enquanto está pendente. */
function Card({ r }: { r: Reservation }) {
  const { upsertReservation } = useLive();
  const [p, start] = useTransition();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const decide = (to: "approved" | "rejected") => start(async () => {
    setErr(null);
    try {
      const res = await decideReservationAction(r.id, to, note || null);
      if (res.ok) upsertReservation(res.reservation);
      else { if (res.reservation) upsertReservation(res.reservation); setErr(res.message); }
    } catch { setErr("Sem ligação. Tente de novo."); }
  });
  return (
    <article data-testid={`reservation-${r.code}`} data-status={r.status}
      className={`rounded-2xl border bg-kau-900 p-4 ${r.status === "pending" ? "border-[#e0a64a]/60" : "border-kau-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl capitalize text-white">{fmtResDate(r.date)} · {r.time}</p>
          <p className="text-sm text-gold-300">{r.guests} {r.guests === 1 ? "pessoa" : "pessoas"} · {r.code}</p>
        </div>
        <ReservationBadge status={r.status} />
      </div>
      <dl className="mt-3 space-y-1 border-t border-kau-800 pt-3 text-sm">
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-mist">Nome</dt><dd className="text-white">{r.name}{r.hasAccount && <span className="ml-2 text-xs text-gold-300">(cliente com conta)</span>}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-mist">Telefone</dt><dd><a href={`tel:${r.phone}`} className="text-white underline-offset-4 hover:underline">{r.phone}</a></dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-mist">Email</dt><dd className="break-all text-white">{r.email ?? "—"}</dd></div>
        {r.notes && <div className="flex gap-2"><dt className="w-20 shrink-0 text-mist">Notas</dt><dd className="text-[#e0a64a]">{r.notes}</dd></div>}
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-mist">Pedido</dt><dd className="text-mist">{when(r.createdAt)}</dd></div>
      </dl>
      {r.status !== "pending" && r.decidedBy && (
        <p className="mt-2 text-xs text-mist">
          {r.status === "cancelled" ? "Cancelada pelo cliente" : `${RESERVATION_LABEL[r.status]} por ${r.decidedBy}`}{r.decidedAt ? ` · ${when(r.decidedAt)}` : ""}
          {r.decisionNote ? ` · “${r.decisionNote}”` : ""}
        </p>
      )}
      {r.status === "pending" && (
        <div className="mt-3 space-y-2">
          <label className="sr-only" htmlFor={`note-${r.id}`}>Mensagem para o cliente (opcional)</label>
          <input id={`note-${r.id}`} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} disabled={p}
            placeholder="Mensagem para o cliente (opcional) — ex.: mesa junto à janela / sem lugar às 20h, temos às 21h"
            className="h-11 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white" />
          <div className="flex gap-2">
            <button onClick={() => decide("approved")} disabled={p} className="h-11 flex-1 rounded-full bg-gold px-4 text-sm font-medium text-kau-950 disabled:opacity-50">{p ? "…" : "Aprovar"}</button>
            <button onClick={() => decide("rejected")} disabled={p} className="h-11 flex-1 rounded-full border border-[#e48a7d]/60 px-4 text-sm text-[#f0b2a8] disabled:opacity-50">Rejeitar</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm text-[#e48a7d]">{err}</p>}
    </article>
  );
}

/** Reservas em tempo real: pendentes (as mais antigas primeiro) e as próximas aprovadas. */
export function ReservationsBoard({ today }: { today: string }) {
  const { reservations, loaded } = useLive();
  if (!loaded) return <p className="py-12 text-center text-mist">A carregar…</p>;
  const pending = reservations.filter((r) => r.status === "pending").sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const upcoming = reservations.filter((r) => r.status === "approved" && r.date >= today);
  const recent = reservations.filter((r) => (r.status === "rejected" || r.status === "cancelled") && r.date >= today);
  return (
    <div className="space-y-10">
      <section aria-labelledby="pendentes" data-testid="reservations-pending">
        <h2 id="pendentes" className="font-display text-2xl text-white">Pendentes ({pending.length})</h2>
        {pending.length === 0
          ? <p className="mt-3 rounded-2xl border border-dashed border-kau-800 p-6 text-center text-sm text-mist">Sem reservas à espera de decisão. Os pedidos novos aparecem aqui sozinhos, com alerta.</p>
          : <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pending.map((r) => <Card key={r.id} r={r} />)}</div>}
      </section>
      <section aria-labelledby="proximas" data-testid="reservations-upcoming">
        <h2 id="proximas" className="font-display text-2xl text-white">Próximas aprovadas ({upcoming.length})</h2>
        {upcoming.length === 0
          ? <p className="mt-3 text-sm text-mist">Nenhuma reserva aprovada de hoje em diante.</p>
          : <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{upcoming.map((r) => <Card key={r.id} r={r} />)}</div>}
      </section>
      {recent.length > 0 && (
        <section aria-labelledby="recusadas">
          <h2 id="recusadas" className="font-display text-xl text-white">Rejeitadas ou canceladas (de hoje em diante)</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{recent.map((r) => <Card key={r.id} r={r} />)}</div>
        </section>
      )}
    </div>
  );
}
