"use client";
import { useCallback, useEffect, useState } from "react";
import type { PublicReservation } from "@/lib/types";
import { fmtResDate } from "@/lib/types";
import { loadSaved, markSeen } from "./store";

type Notice = { token: string; r: PublicReservation };

/**
 * Aviso automático no site: quando o restaurante APROVA ou REJEITA uma reserva feita neste telemóvel,
 * aparece um cartão (em qualquer página do site) com o resultado e os detalhes. Mostrado uma vez por decisão.
 * Verifica ao abrir a página, ao voltar ao separador e a cada 20 s.
 */
export function ReservationNotifier() {
  const [notices, setNotices] = useState<Notice[]>([]);

  const check = useCallback(async () => {
    const saved = loadSaved();
    if (!saved.length || document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/reservas?t=${saved.map((s) => s.token).join(",")}`, { cache: "no-store" });
      if (!res.ok) return;
      const { reservations } = (await res.json()) as { reservations: PublicReservation[] };
      const byCode = new Map(saved.map((s) => [s.code, s]));
      const fresh: Notice[] = [];
      for (const r of reservations) {
        const s = byCode.get(r.code);
        if (s && (r.status === "approved" || r.status === "rejected") && s.seen !== r.status) fresh.push({ token: s.token, r });
      }
      setNotices(fresh);
    } catch {}
  }, []);

  useEffect(() => {
    const first = setTimeout(check, 300);
    const t = setInterval(check, 20_000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("nokau-reservas", check);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("nokau-reservas", check); };
  }, [check]);

  if (!notices.length) return null;
  const close = (n: Notice) => { markSeen(n.token, n.r.status); setNotices((l) => l.filter((x) => x.token !== n.token)); };

  return (
    <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 space-y-3 sm:left-6 sm:right-auto sm:w-[26rem] lg:bottom-8" aria-live="polite">
      {notices.slice(0, 3).map((n) => {
        const ok = n.r.status === "approved";
        return (
          <div key={n.token} role="status" data-testid="reservation-notice" data-status={n.r.status}
            className={`rounded-2xl border p-4 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md ${ok ? "border-[#7fc290]/60 bg-kau-950/95" : "border-[#e48a7d]/60 bg-kau-950/95"}`}>
            <p className={`font-display text-xl ${ok ? "text-[#a9dbb4]" : "text-[#f0b2a8]"}`}>
              {ok ? "✓ Reserva aprovada!" : "Reserva não aprovada"}
            </p>
            <p className="mt-1 text-sm text-white">
              {n.r.code} · <span className="capitalize">{fmtResDate(n.r.date)}</span> às {n.r.time} · {n.r.guests} {n.r.guests === 1 ? "pessoa" : "pessoas"}
            </p>
            {n.r.decisionNote && <p className="mt-1 text-sm text-mist">“{n.r.decisionNote}”</p>}
            {!ok && <p className="mt-1 text-xs text-mist">Pode pedir outro horário ou ligar-nos.</p>}
            <div className="mt-3 flex gap-2">
              <a href={`/reserva/${n.token}`} onClick={() => markSeen(n.token, n.r.status)} className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-kau-950">Ver reserva</a>
              <button onClick={() => close(n)} className="rounded-full border border-kau-800 px-4 py-2 text-sm text-mist hover:text-white">Fechar</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
