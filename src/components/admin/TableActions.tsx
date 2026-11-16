"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTableAction, renameTableAction, rotateTokenAction, toggleTableAction } from "@/app/admin/actions";

export function AddTableButton() {
  const router = useRouter();
  const [p, start] = useTransition();
  return (
    <button disabled={p} onClick={() => start(async () => { await addTableAction(); router.refresh(); })}
      className="h-11 rounded-full bg-gold px-5 text-sm font-medium text-kau-950 disabled:opacity-50">
      + Adicionar mesa
    </button>
  );
}

export function TableControls({ id, label, active }: { id: number; label: string; active: boolean }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [name, setName] = useState(label);
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  const btn = "rounded-full border border-kau-800 px-3 py-2 text-xs text-mist hover:text-white disabled:opacity-50";
  return (
    <div className="space-y-2 print:hidden">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`n-${id}`}>Nome da mesa</label>
        <input id={`n-${id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
          className="h-10 min-w-0 flex-1 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white" />
        <button className={btn} disabled={p || !name.trim() || name === label} onClick={() => run(() => renameTableAction(id, name))}>Guardar</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={p} onClick={() => run(() => toggleTableAction(id, !active))}>{active ? "Desativar" : "Ativar"}</button>
        <button className={btn} disabled={p}
          onClick={() => { if (confirm(`Gerar um novo QR Code para ${label}? O QR Code impresso atual deixa de funcionar.`)) run(() => rotateTokenAction(id)); }}>
          Gerar novo QR
        </button>
      </div>
    </div>
  );
}

export function PrintButton() {
  return <button onClick={() => window.print()} className="h-11 rounded-full border border-gold/60 px-5 text-sm text-gold-300 hover:bg-gold/10 print:hidden">🖨 Imprimir todos</button>;
}
