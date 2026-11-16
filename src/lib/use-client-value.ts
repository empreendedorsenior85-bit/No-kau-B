"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Valor calculado só no cliente (ex.: data atual). Na pré-renderização devolve `null`,
 * evitando valores congelados no HTML estático. `read` deve devolver um primitivo.
 */
export function useClientValue<T extends string | number>(read: () => T): T | null {
  return useSyncExternalStore(noop, read, () => null);
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Relógio que se atualiza a cada `ms` (cliente). Devolve 0 no servidor, para nunca congelar uma hora na pré-renderização. */
export function useNow(ms = 30_000): number {
  return useSyncExternalStore(
    (cb) => { const t = setInterval(cb, ms); return () => clearInterval(t); },
    () => Math.floor(Date.now() / ms) * ms,
    () => 0,
  );
}
