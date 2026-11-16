import type { ReactNode } from "react";

export type Tone = "pending" | "ok" | "danger" | "muted" | "demo" | "gold";

const tones: Record<Tone, string> = {
  pending: "bg-warn/15 text-[#e0a64a] ring-warn/40",
  ok: "bg-ok/15 text-[#7fc290] ring-ok/40",
  danger: "bg-danger/15 text-[#e48a7d] ring-danger/40",
  muted: "bg-white/5 text-mist ring-white/15",
  demo: "bg-transparent text-gold-300 ring-gold-300/60 border-dashed",
  gold: "bg-gold/15 text-gold-300 ring-gold/40",
};

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-[0.12em] ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Estados de reserva definidos no caderno de encargos. */
export const reservationStatus = {
  pending: { label: "Pendente", tone: "pending" },
  confirmed: { label: "Confirmada", tone: "ok" },
  declined: { label: "Recusada", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "muted" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
