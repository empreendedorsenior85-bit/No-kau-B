"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReservationStatus } from "@/lib/types";

/** Página da reserva aberta: quando o estado muda (aprovada/rejeitada), a página atualiza-se sozinha. */
export function ReservationLive({ token, status }: { token: string; status: ReservationStatus }) {
  const router = useRouter();
  useEffect(() => {
    if (status !== "pending") return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/reservas?t=${token}`, { cache: "no-store" });
        const d = (await r.json()) as { reservations: { status: ReservationStatus }[] };
        if (d.reservations[0] && d.reservations[0].status !== status) router.refresh();
      } catch {}
    }, 10_000);
    return () => clearInterval(t);
  }, [token, status, router]);
  return null;
}
