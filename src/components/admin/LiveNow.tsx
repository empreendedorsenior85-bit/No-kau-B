"use client";
import Link from "next/link";
import { useLive } from "./LiveOrders";
import { StatusBadge } from "./OrderCard";
import { formatOrderNumber } from "@/lib/types";
import { formatWait, formatXOF } from "@/lib/format";
import { useNow } from "@/lib/use-client-value";

function Num({ v, label, tone, id }: { v: number | string; label: string; tone: string; id: string }) {
  return (
    <div className="rounded-xl bg-kau-950/60 p-3 text-center" data-testid={id}>
      <p className={`font-sans text-2xl font-semibold tabular-nums ${tone}`}>{v}</p>
      <p className="mt-0.5 text-[0.7rem] uppercase tracking-wider text-mist">{label}</p>
    </div>
  );
}

const ATTENTION_MIN = 10; // pedido pendente há mais de 10 minutos precisa de atenção

/** Estado da operação AGORA, em tempo real (mesmos dados do painel de pedidos). */
export function LiveNow() {
  const { orders, loaded } = useLive();
  const now = useNow(15_000);
  const pending = orders.filter((o) => o.status === "pending");
  const preparing = orders.filter((o) => o.status === "preparing");
  const busyTables = new Set([...pending, ...preparing].map((o) => o.tableId)).size;
  const mins = (iso: string) => (now ? Math.max(0, Math.floor((now - +new Date(iso)) / 60_000)) : 0);
  const waiting = [...pending].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const late = waiting.filter((o) => mins(o.createdAt) >= ATTENTION_MIN);
  const recent = orders.slice(0, 6);

  return (
    <section className="rounded-2xl border border-kau-800 bg-kau-900 p-5" aria-label="Agora" data-testid="live-now">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-white">Agora</h2>
        <Link href="/admin/pedidos" className="text-xs text-gold-300 hover:underline">Abrir pedidos →</Link>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Num id="live-pending" v={loaded ? pending.length : "–"} label="Pendentes" tone="text-[#e0a64a]" />
        <Num id="live-preparing" v={loaded ? preparing.length : "–"} label="Em preparação" tone="text-[#8ab9e6]" />
        <Num id="live-tables" v={loaded ? busyTables : "–"} label="Mesas ativas" tone="text-white" />
      </div>

      <h3 className="mt-5 text-sm text-mist">A precisar de atenção</h3>
      {late.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-kau-800 py-4 text-center text-sm text-mist" data-testid="live-late-empty">Nenhum pedido à espera há mais de {ATTENTION_MIN} min.</p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="live-late">
          {late.map((o) => (
            <li key={o.id}>
              <Link href="/admin/pedidos" className="flex items-center justify-between rounded-xl border border-[#e0a64a]/40 bg-[#e0a64a]/10 px-3 py-2 text-sm">
                <span className="text-white">{formatOrderNumber(o.number, o.origin)} · {o.tableLabel}</span>
                <span className="text-[#e0a64a]">⏱ {formatWait(mins(o.createdAt))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 text-sm text-mist">Atividade recente</h3>
      <ul className="mt-2 divide-y divide-kau-800" data-testid="live-recent">
        {recent.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate text-white">{formatOrderNumber(o.number, o.origin)} · {o.tableLabel}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-mist">{formatXOF(o.total)}</span>
              <StatusBadge status={o.status} />
            </span>
          </li>
        ))}
        {loaded && recent.length === 0 && <li className="py-4 text-center text-sm text-mist">Ainda sem pedidos.</li>}
      </ul>
    </section>
  );
}
