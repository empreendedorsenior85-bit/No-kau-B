"use client";
import { useEffect, useState } from "react";
import type { SyncStatusView } from "@/app/api/admin/sync-status/route";

const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
};

/**
 * Estado da sincronização entre o servidor local do restaurante e o central.
 * Servidor local: ligado/sem internet e pedidos por enviar. Central: último contacto do servidor local.
 */
export function SyncStatus() {
  const [s, setS] = useState<SyncStatusView | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/admin/sync-status", { cache: "no-store" });
        if (r.ok && !stop) { setS(await r.json()); setNow(Date.now()); }
      } catch {}
    };
    load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  if (!s) return null;

  if (s.role === "central") {
    if (!s.peer) return null;
    const fresh = now - Date.parse(s.peer.lastSeenAt) < 45_000; // o central regista o contacto no máximo a cada 20 s
    return (
      <span data-testid="sync-status" className="hidden items-center gap-2 sm:flex" title="Servidor local do restaurante (rede Wi-Fi)">
        <span className={`h-2.5 w-2.5 rounded-full ${fresh ? "bg-[#7fc290]" : "bg-[#e0a64a]"}`} aria-hidden />
        {fresh ? "Servidor do restaurante ligado" : `Servidor do restaurante sem contacto (${ago(s.peer.lastSeenAt, now)})`}
      </span>
    );
  }

  const syncNow = async () => {
    setBusy(true);
    try { await fetch("/api/admin/sync-status", { method: "POST" }); const r = await fetch("/api/admin/sync-status", { cache: "no-store" }); if (r.ok) { setS(await r.json()); setNow(Date.now()); } } catch {}
    setBusy(false);
  };
  return (
    <span data-testid="sync-status" data-online={s.online ? "1" : "0"} data-pending={s.pending} className="flex items-center gap-2" role="status" aria-live="polite"
      title={s.lastError ?? (s.lastOkAt ? `Última sincronização ${ago(s.lastOkAt, now)}` : "")}>
      <span className={`h-2.5 w-2.5 rounded-full ${s.online ? (s.pending ? "bg-[#e0a64a]" : "bg-[#7fc290]") : "bg-[#e48a7d]"}`} aria-hidden />
      <span>
        Servidor local · {s.online ? (s.pending ? `a enviar ${s.pending} ao central` : "sincronizado") : "sem internet"}
        {!s.online && s.pending > 0 && ` · ${s.pending} por enviar`}
        {s.rejected > 0 && ` · ${s.rejected} recusado(s) pelo central (ver Atividade)`}
      </span>
      <button onClick={syncNow} disabled={busy} className="rounded-full border border-kau-800 px-2 py-0.5 hover:text-white disabled:opacity-50">{busy ? "…" : "Sincronizar"}</button>
    </span>
  );
}

/** Aviso grande, só no servidor local sem internet. */
export function LocalOfflineBanner() {
  const [s, setS] = useState<SyncStatusView | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => { try { const r = await fetch("/api/admin/sync-status", { cache: "no-store" }); if (r.ok && !stop) setS(await r.json()); } catch {} };
    load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  if (!s || s.role !== "local" || s.online) return null;
  return (
    <p role="alert" data-testid="local-offline" className="bg-[#e0a64a]/15 px-4 py-2 text-center text-sm text-[#e0a64a]">
      Sem ligação ao site central. O restaurante continua a funcionar neste servidor local
      {s.pending > 0 ? ` — ${s.pending} pedido(s) serão enviados automaticamente quando a internet voltar.` : "."}
    </p>
  );
}
