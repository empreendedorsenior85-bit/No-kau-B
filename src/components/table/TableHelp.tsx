"use client";
import { useCallback, useEffect, useState } from "react";
import type { PublicCall } from "@/lib/calls";
import type { CallKind } from "@/lib/types";
import { newKey } from "@/lib/cart";
import { formatXOF } from "@/lib/format";

const BUTTONS: { kind: CallKind; label: string; icon: string }[] = [
  { kind: "waiter", label: "Chamar empregado", icon: "🙋" },
  { kind: "bill", label: "Pedir a conta", icon: "🧾" },
  { kind: "manager", label: "Chamar gerente", icon: "👔" },
];
const WAITING: Record<CallKind, string> = {
  waiter: "Empregado chamado — o restaurante foi avisado",
  manager: "Gerente chamado — o restaurante foi avisado",
  bill: "Conta pedida — o restaurante foi avisado",
};
const COMING: Record<CallKind, string> = {
  waiter: "Um empregado está a caminho",
  manager: "O gerente está a caminho",
  bill: "A conta está a caminho",
};

/**
 * Ajuda à mesa: chamar empregado, pedir a conta, chamar gerente — com o estado em tempo (quase) real.
 * Sem internet NÃO fica em fila: uma chamada que chega 10 minutos depois engana o cliente.
 */
export function TableHelp({ token, online }: { token: string; online: boolean }) {
  const [calls, setCalls] = useState<PublicCall[]>([]);
  const [busy, setBusy] = useState<CallKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/chamadas?t=${token}`, { cache: "no-store" });
      if (r.ok) setCalls(((await r.json()) as { calls: PublicCall[] }).calls);
    } catch {}
  }, [token]);

  const active = calls.filter((c) => c.status === "open" || c.status === "ack");
  // acompanha enquanto houver chamadas ativas (e uma vez ao abrir)
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);
  useEffect(() => {
    if (active.length === 0) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active.length, load]);

  const call = async (kind: CallKind) => {
    setError(null);
    if (!online) { setError("Sem ligação à internet: faça sinal a um empregado."); return; }
    setBusy(kind);
    const key = newKey();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch("/api/chamadas", {
          method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ token, kind, key }), signal: AbortSignal.timeout(10_000),
        });
        const data = (await r.json().catch(() => null)) as { ok?: boolean; call?: PublicCall; message?: string; retry?: boolean } | null;
        if (r.ok && data?.ok && data.call) {
          setCalls((cs) => [data.call!, ...cs.filter((c) => c.id !== data.call!.id)]);
          setBusy(null);
          return;
        }
        if (!(r.status >= 500 || data?.retry)) { setError(data?.message ?? "Não foi possível chamar. Faça sinal a um empregado."); break; }
      } catch {}
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      if (attempt === 2) setError("Não foi possível chamar agora (rede). Faça sinal a um empregado.");
    }
    setBusy(null);
  };

  const cancel = async (id: string) => {
    try {
      const r = await fetch(`/api/chamadas/${id}?t=${token}`, { method: "DELETE" });
      if (r.ok) { const d = (await r.json()) as { call: PublicCall }; setCalls((cs) => cs.map((c) => (c.id === id ? d.call : c))); }
    } catch {}
  };

  const recentDone = calls.filter((c) => c.status === "done").slice(0, 1);

  return (
    <section aria-labelledby="ajuda" data-testid="table-help" className="mt-5 rounded-2xl border border-kau-800 bg-kau-900 p-4">
      <h2 id="ajuda" className="font-display text-xl text-white">Precisa de ajuda?</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {BUTTONS.map((b) => {
          const isActive = active.some((c) => c.kind === b.kind);
          return (
            <button key={b.kind} onClick={() => call(b.kind)} disabled={busy !== null || isActive}
              data-testid={`call-${b.kind}`}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-gold/50 bg-kau-950 px-2 py-2 text-center text-xs font-medium leading-tight text-gold-300 transition-transform active:scale-95 disabled:opacity-50">
              <span aria-hidden className="text-lg">{b.icon}</span>
              {busy === b.kind ? "A chamar…" : b.label}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-[#f0b2a8]">{error}</p>}
      {(active.length > 0 || recentDone.length > 0) && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {active.map((c) => (
            <li key={c.id} data-testid="call-status" data-kind={c.kind} data-status={c.status}
              className={`rounded-xl px-3 py-2 text-sm ${c.status === "ack" ? "bg-[#7fc290]/10 text-[#a9dbb4]" : "bg-[#e0a64a]/10 text-[#f3d29b]"}`}>
              {c.status === "ack" ? `✓ ${COMING[c.kind]}` : `⏳ ${WAITING[c.kind]}`}
              {c.kind === "bill" && c.amount != null && c.amount > 0 && <span className="block text-xs text-mist">Total estimado dos seus pedidos: {formatXOF(c.amount)}</span>}
              {c.status === "open" && (
                <button onClick={() => cancel(c.id)} className="ml-2 text-xs text-mist underline underline-offset-4 hover:text-white">Cancelar</button>
              )}
            </li>
          ))}
          {active.length === 0 && recentDone.map((c) => (
            <li key={c.id} data-testid="call-status" data-kind={c.kind} data-status="done" className="rounded-xl bg-white/5 px-3 py-2 text-sm text-mist">✓ Pedido de ajuda resolvido. Obrigado!</li>
          ))}
        </ul>
      )}
    </section>
  );
}
