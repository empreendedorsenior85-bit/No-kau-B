"use client";
/**
 * Reservas deste telemóvel (localStorage "nokau-reservas"): o link secreto de cada uma e o último estado já
 * mostrado ao cliente — para avisar UMA vez quando o restaurante aprova ou rejeita.
 */
export type Saved = { token: string; code: string; seen: string; date: string };
const KEY = "nokau-reservas";

export function loadSaved(): Saved[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => x && typeof x.token === "string") : []; } catch { return []; }
}
function store(list: Saved[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20))); window.dispatchEvent(new Event("nokau-reservas")); } catch {}
}
/** Guarda (ou atualiza) uma reserva. `seen`: estado que o cliente já viu (na própria página da reserva vê tudo). */
export function remember(r: { token: string; code: string; date: string }, seen: string) {
  const list = loadSaved().filter((x) => x.token !== r.token);
  // reservas com mais de 30 dias saem da lista
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  store([{ token: r.token, code: r.code, date: r.date, seen }, ...list.filter((x) => x.date >= cutoff)]);
}
export function markSeen(token: string, status: string) {
  store(loadSaved().map((x) => (x.token === token ? { ...x, seen: status } : x)));
}
