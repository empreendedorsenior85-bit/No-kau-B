"use client";

export type OrderPayload = { token: string; key: string; lines: { itemId: number; quantity: number; note?: string }[] };
export type SendResult =
  | { ok: true; orderId: string; number: number; duplicate: boolean }
  | { ok: false; message: string; itemIds?: number[]; network?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 20_000;

/**
 * Envia o pedido com tempo limite e repetição automática (rede móvel instável, base de dados a acordar).
 * TODAS as tentativas usam a MESMA chave: o servidor devolve sempre o mesmo pedido, nunca cria dois.
 * Só se repete perante falhas de rede/servidor; erros "do pedido" (produto indisponível…) param logo.
 */
export async function sendOrder(payload: OrderPayload, onRetry?: (attempt: number) => void): Promise<SendResult> {
  let lastServerMessage: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) { onRetry?.(attempt); await sleep(700 * 2 ** (attempt - 2)); }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/pedidos", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
        signal: ctl.signal, cache: "no-store", keepalive: false,
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; orderId?: string; number?: number; duplicate?: boolean; message?: string; itemIds?: number[]; retry?: boolean } | null;
      if (res.ok && data?.ok && data.orderId) return { ok: true, orderId: data.orderId, number: data.number ?? 0, duplicate: !!data.duplicate };
      // falha temporária do servidor (5xx, 429 sem corpo útil, página de erro do alojamento): repetir
      const temporary = res.status >= 500 || res.status === 408 || (data?.retry === true);
      if (!temporary) return { ok: false, message: data?.message ?? "Não foi possível enviar o pedido.", itemIds: data?.itemIds };
      lastServerMessage = data?.message ?? null;
    } catch {
      // sem rede, tempo esgotado ou ligação cortada: repetir
    } finally {
      clearTimeout(timer);
    }
  }
  return lastServerMessage
    ? { ok: false, message: "O restaurante não conseguiu receber o pedido neste momento. O pedido está guardado — toque em enviar novamente ou chame um empregado." }
    : { ok: false, network: true, message: "Sem ligação à internet. O pedido está guardado — tente novamente quando tiver rede." };
}
