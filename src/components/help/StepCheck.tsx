"use client";
import { useSyncExternalStore } from "react";

/**
 * "Feito" de cada passo do tutorial, guardado só neste aparelho (localStorage).
 * Sem acesso ao armazenamento (modo privado, bloqueado) o tutorial funciona igual — só não se lembra.
 */
const KEY = "nk-tutorial-impressora";
const read = (): string[] => { try { return parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const subscribe = (cb: () => void) => { window.addEventListener("storage", cb); window.addEventListener("nk-tutorial", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("nk-tutorial", cb); }; };
const parse = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };
const snapshot = () => { try { return localStorage.getItem(KEY) ?? "[]"; } catch { return "[]"; } };

function toggle(id: string) {
  const s = new Set(read());
  if (s.has(id)) s.delete(id); else s.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch {}
  window.dispatchEvent(new Event("nk-tutorial"));
}

export function StepCheck({ id }: { id: string }) {
  const done = parse(useSyncExternalStore(subscribe, snapshot, () => "[]")).includes(id);
  return (
    <button type="button" onClick={() => toggle(id)} aria-pressed={done} data-testid={`step-done-${id}`}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${done ? "bg-[#7fc290]/15 text-[#a9dbb4] ring-1 ring-[#7fc290]/50" : "border border-gold/60 text-gold-300 hover:bg-gold/10"}`}>
      <span aria-hidden>{done ? "✓" : "○"}</span>{done ? "Feito" : "Marcar como feito"}
    </button>
  );
}

/** Progresso geral (x de n passos feitos). */
export function StepProgress({ ids }: { ids: string[] }) {
  const done = parse(useSyncExternalStore(subscribe, snapshot, () => "[]")).filter((x) => ids.includes(x)).length;
  return (
    <div className="flex items-center gap-3" data-testid="tutorial-progress" aria-live="polite">
      <div className="h-2 w-40 overflow-hidden rounded-full bg-kau-800" aria-hidden><div className="h-full bg-gold transition-[width]" style={{ width: `${(done / ids.length) * 100}%` }} /></div>
      <span className="text-sm text-mist">{done} de {ids.length} passos feitos</span>
    </div>
  );
}
