"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { OrderItem, OrderStatus } from "@/lib/types";
import { PAYMENT_ACCEPTED_TEXT, STATUS_CLIENT, formatOrderNumber } from "@/lib/types";
import { formatXOF } from "@/lib/format";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";

type View = { number: number; origin: "central" | "local"; tableLabel: string; status: OrderStatus; total: number; createdAt: string; items: OrderItem[] };
const STEPS: OrderStatus[] = ["pending", "preparing", "done"];
const STEP_LABEL = ["Recebido", "Em preparação", "Pronto"];

export function OrderTracker({ token, orderId, initial }: { token: string; orderId: string; initial: View }) {
  const [o, setO] = useState<View>(initial);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`/api/pedidos/${orderId}?t=${token}`, { cache: "no-store" });
        if (r.ok) { if (!stop) { setO(await r.json()); setOffline(false); } }
        else if (r.status !== 429) setOffline(true);
      } catch {
        setOffline(true);
      }
      if (!stop) timer = setTimeout(tick, document.hidden ? 15_000 : 4_000);
    };
    timer = setTimeout(tick, 4_000);
    const onVis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onVis);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", onVis); };
  }, [orderId, token]);

  const idx = STEPS.indexOf(o.status);
  const info = STATUS_CLIENT[o.status];
  const time = new Date(o.createdAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

  return (
    <main className="nums-lining mx-auto min-h-svh max-w-xl bg-kau-950 px-5 pb-16 pt-8">
      <div className="flex items-center gap-3">
        <Logo size={40} className="h-10 w-10" />
        <span className="font-display text-lg text-white">Nô Kau</span>
      </div>

      <div role="status" aria-live="polite" className="mt-8 rounded-[1.75rem] border border-ok/40 bg-ok/10 p-6 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-[#7fc290]">{o.status === "done" ? "Pedido pronto" : "Pedido enviado"}</p>
        <h1 className="mt-2 font-display text-5xl text-white">{formatOrderNumber(o.number, o.origin)}</h1>
        <p className="mt-2 font-display text-2xl text-gold-300">{o.tableLabel}</p>
        <p className="mt-3 text-sm text-mist">Feito às {time}</p>
      </div>

      <section className="mt-6 rounded-2xl border border-kau-800 bg-kau-900 p-5" aria-label="Estado do pedido">
        <p className="font-display text-xl text-white">{info.title}</p>
        <p className="mt-1 text-sm text-mist">{info.hint}</p>
        <ol className="mt-5 grid grid-cols-3 gap-2">
          {STEP_LABEL.map((label, i) => (
            <li key={label} className="text-center">
              <div className={`h-1.5 rounded-full ${i <= idx ? "bg-gold" : "bg-kau-800"}`} />
              <p className={`mt-2 text-xs ${i === idx ? "font-medium text-gold-300" : i < idx ? "text-white" : "text-mist"}`}>
                {i < idx ? "✓ " : ""}{label}
              </p>
            </li>
          ))}
        </ol>
        {offline && <p role="alert" className="mt-4 text-xs text-[#e0a64a]">Sem ligação — a atualizar assim que houver rede.</p>}
      </section>

      <section className="mt-6" aria-label="Resumo do pedido">
        <h2 className="font-display text-2xl text-white">Resumo</h2>
        <ul className="mt-3 divide-y divide-kau-800 rounded-2xl border border-kau-800 bg-kau-900">
          {o.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-4 p-4">
              <div>
                <p className="text-white">{it.quantity} × {it.name}</p>
                {it.note && <p className="mt-0.5 text-sm italic text-mist">“{it.note}”</p>}
              </div>
              <p className="shrink-0 text-mist">{formatXOF(it.unitPrice * it.quantity)}</p>
            </li>
          ))}
          <li className="flex items-center justify-between p-4 font-display text-xl text-white">
            <span>Total</span>
            <span className="text-gold-300">{formatXOF(o.total)}</span>
          </li>
        </ul>
        <p className="mt-2 text-center text-xs text-mist" data-testid="payment-methods">O pagamento é feito no restaurante: {PAYMENT_ACCEPTED_TEXT}.</p>
      </section>

      <div className="mt-8 flex flex-col gap-3">
        <ButtonLink href={`/m/${token}`} size="lg">Fazer outro pedido</ButtonLink>
        <Link href={`/m/${token}`} className="text-center text-sm text-mist underline underline-offset-4">Voltar ao menu</Link>
      </div>
    </main>
  );
}
