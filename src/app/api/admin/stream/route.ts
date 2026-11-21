import { errInfo, log } from "@/lib/log";
import { getManager } from "@/lib/auth";
import { changedSince, currentRev } from "@/lib/orders";
import { callsChangedSince } from "@/lib/calls";
import { reservationsChangedSince } from "@/lib/reservations";
import { paymentsChangedSince } from "@/lib/payments";
import { isManagerRole } from "@/lib/auth-types";
import { stockChangedSince } from "@/lib/stock";

export const maxDuration = 300;

const POLL_MS = 1500;
const MAX_MS = 270_000; // reabre antes do limite da plataforma; o navegador reconecta sozinho

/**
 * Server-Sent Events: envia cada pedido novo ou alterado. Funciona em qualquer alojamento
 * (sem WebSocket) e recupera sozinho: o navegador reenvia o último `id` recebido.
 */
export async function GET(req: Request) {
  const me = await getManager();
  if (!me) return new Response("unauthorized", { status: 401 });
  const seesReservations = isManagerRole(me.role); // dados pessoais: só Admin e Gerente

  const url = new URL(req.url);
  const header = req.headers.get("last-event-id");
  const startRaw = header ?? url.searchParams.get("after");
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch {}
      };
      req.signal.addEventListener("abort", close);
      const send = (s: string) => { if (!closed) { try { controller.enqueue(enc.encode(s)); } catch { close(); } } };

      try {
        let cursor = startRaw && /^\d+$/.test(startRaw) ? Number(startRaw) : await currentRev();
        const sent = new Map<string, number>();
        const started = Date.now();
        let lastBeat = Date.now();
        send(`retry: 3000\n\n: ligado\n\n`);

        while (!closed && Date.now() - started < MAX_MS) {
          const rows = await changedSince(cursor);
          const calls = await callsChangedSince(cursor); // mesma sequência de rev: o mesmo cursor serve os dois
          const reservations = seesReservations ? await reservationsChangedSince(cursor) : [];
          const payments = seesReservations ? await paymentsChangedSince(cursor) : []; // pagamentos: só Admin e Gerente
          const stock = seesReservations ? await stockChangedSince(cursor) : []; // stock: só Admin e Gerente
          let next = cursor;
          for (const o of rows) {
            if (sent.get(o.id) === o.rev) continue;
            sent.set(o.id, o.rev);
            next = Math.max(next, o.rev);
            send(`id: ${o.rev}\nevent: order\ndata: ${JSON.stringify(o)}\n\n`);
          }
          for (const c of calls) {
            if (sent.get(c.id) === c.rev) continue;
            sent.set(c.id, c.rev);
            next = Math.max(next, c.rev);
            send(`id: ${c.rev}\nevent: call\ndata: ${JSON.stringify(c)}\n\n`);
          }
          for (const r of reservations) {
            if (sent.get(r.id) === r.rev) continue;
            sent.set(r.id, r.rev);
            next = Math.max(next, r.rev);
            send(`id: ${r.rev}\nevent: reservation\ndata: ${JSON.stringify(r)}\n\n`);
          }
          for (const p of payments) {
            if (sent.get(p.id) === p.rev) continue;
            sent.set(p.id, p.rev);
            next = Math.max(next, p.rev);
            send(`id: ${p.rev}\nevent: payment\ndata: ${JSON.stringify(p)}\n\n`);
          }
          for (const l of stock) {
            const k = `stock:${l.menuItemId}`;
            if (sent.get(k) === l.rev) continue;
            sent.set(k, l.rev);
            next = Math.max(next, l.rev);
            send(`id: ${l.rev}\nevent: stock\ndata: ${JSON.stringify(l)}\n\n`);
          }
          cursor = next;
          if (sent.size > 500) sent.clear();
          if (Date.now() - lastBeat > 10_000) { send(`: ping\n\n`); lastBeat = Date.now(); }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch (e) {
        log.error("admin.stream_failed", errInfo(e));
      } finally {
        close();
      }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
