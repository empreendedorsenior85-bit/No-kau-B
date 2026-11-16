"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type CartLine = { itemId: number; name: string; price: number; qty: number; note: string };
type Stored = { key: string; lines: CartLine[] };

/** Chave do pedido. `crypto.randomUUID` não existe em telemóveis/navegadores mais antigos: há alternativas. */
export function newKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
  } catch {}
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export const isValidKey = (k: string) => /^[A-Za-z0-9_-]{16,64}$/.test(k);
const storageKey = (token: string) => `nokau-cart-${token}`;

/**
 * Carrinho por mesa, guardado no telemóvel. A `key` identifica ESTE pedido:
 * se o envio for repetido (duplo toque, rede lenta) o servidor devolve o mesmo pedido.
 * Preços aqui são só para mostrar; o servidor recalcula tudo.
 */
export function useCart(token: string, menu: { id: number; name: string; price: number; available: boolean }[]) {
  const [state, setState] = useState<Stored>({ key: "", lines: [] });
  const [ready, setReady] = useState(false);
  const menuRef = useRef(menu); // menu do momento em que a página abriu

  useEffect(() => {
    let stored: Stored | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(storageKey(token)) ?? "null");
    } catch {}
    const byId = new Map(menuRef.current.map((m) => [m.id, m]));
    // reconciliar com o menu atual: preços novos e produtos que deixaram de estar disponíveis
    const lines = (stored?.lines ?? [])
      .filter((l) => byId.get(l.itemId)?.available)
      .map((l) => ({ ...l, name: byId.get(l.itemId)!.name, price: byId.get(l.itemId)!.price }));
    setState({ key: stored?.key && isValidKey(stored.key) ? stored.key : newKey(), lines });
    setReady(true);
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey(token), JSON.stringify(state));
    } catch {}
  }, [state, ready, token]);

  const add = useCallback((m: { id: number; name: string; price: number }) =>
    setState((s) => {
      const i = s.lines.findIndex((l) => l.itemId === m.id);
      if (i >= 0) return { ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, qty: Math.min(20, l.qty + 1) } : l)) };
      return { ...s, lines: [...s.lines, { itemId: m.id, name: m.name, price: m.price, qty: 1, note: "" }] };
    }), []);
  const setQty = useCallback((id: number, qty: number) =>
    setState((s) => ({ ...s, lines: qty <= 0 ? s.lines.filter((l) => l.itemId !== id) : s.lines.map((l) => (l.itemId === id ? { ...l, qty: Math.min(20, qty) } : l)) })), []);
  const setNote = useCallback((id: number, note: string) =>
    setState((s) => ({ ...s, lines: s.lines.map((l) => (l.itemId === id ? { ...l, note: note.slice(0, 200) } : l)) })), []);
  const remove = useCallback((ids: number[]) => setState((s) => ({ ...s, lines: s.lines.filter((l) => !ids.includes(l.itemId)) })), []);
  /** Pedido enviado com sucesso: carrinho vazio e NOVA chave para o próximo pedido. */
  const reset = useCallback(() => setState({ key: newKey(), lines: [] }), []);

  const count = state.lines.reduce((n, l) => n + l.qty, 0);
  const total = state.lines.reduce((n, l) => n + l.qty * l.price, 0);
  return { ...state, ready, count, total, add, setQty, setNote, remove, reset };
}
