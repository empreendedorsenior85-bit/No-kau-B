import "server-only";
import { errInfo, log } from "@/lib/log";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/db/init";
import { orderTicket, testTicket, type Codepage } from "./escpos";
import { probe, sendBytes, type Connection } from "./transport";
import { formatOrderNumber } from "@/lib/types";

/**
 * AGENTE DE IMPRESSÃO — corre no servidor do restaurante (NOKAU_ROLE=local, ou NOKAU_PRINT_AGENT=1 num servidor
 * próprio). É o único sítio com acesso às impressoras (rede local / USB); o site na internet não as alcança.
 *
 * Fluxo: pedido ACEITE (Pendente → Em preparação, aqui ou no central e já sincronizado) → 1 trabalho por impressora
 * (cozinha / balcão, conforme as categorias) → envio ESC/POS → impresso.
 *
 * Garantias:
 *  - sem duplicados: chave única por pedido+impressora (a base de dados recusa o segundo);
 *  - um trabalho só é apanhado por um ciclo de cada vez (FOR UPDATE SKIP LOCKED);
 *  - falha de rede/impressora → repete (2 s, 5 s, 15 s, 30 s, 60 s) e depois fica "falhou" (reimprimir à mão);
 *  - sem papel / tampa aberta (se a impressora o disser) → não envia e espera;
 *  - se o agente parar A MEIO de um envio, o trabalho fica "incerto" — NÃO é reenviado sozinho (evita talões em dobro):
 *    o gerente vê e decide reimprimir.
 */
export const isPrintAgent = () => process.env.NOKAU_ROLE === "local" || process.env.NOKAU_PRINT_AGENT === "1";

export type PrinterRow = {
  id: number; name: string; station: "kitchen" | "counter"; connection: "network" | "usb"; host: string | null; port: number;
  device_path: string | null; paper_width: 58 | 80; codepage: Codepage; categories: string[] | null; auto_print: boolean; copies: number;
  active: boolean; enabled_at: Date; last_status: string | null; last_status_at: Date | null; last_error: string | null;
};

export const connOf = (p: Pick<PrinterRow, "connection" | "host" | "port" | "device_path">): Connection =>
  p.connection === "network" ? { kind: "network", host: p.host!, port: p.port } : { kind: "usb", path: p.device_path! };
export const connLabel = (p: Pick<PrinterRow, "connection" | "host" | "port" | "device_path">) =>
  p.connection === "network" ? `Rede ${p.host}:${p.port}` : `USB ${p.device_path}`;

const BACKOFF_S = [2, 5, 15, 30, 60];
const MAX_ATTEMPTS = BACKOFF_S.length + 1;

/** Pedidos aceites ainda sem talão nesta impressora → fila. Só pedidos aceites depois de a impressora ser ligada. */
export async function enqueueAccepted(): Promise<number> {
  const r = await query(
    `insert into print_jobs (printer_id, order_id, kind, dedupe_key, requested_by)
     select p.id, o.id, 'order', 'order:' || o.id || ':p' || p.id, 'automático'
     from printers p join orders o
       on o.status in ('preparing','done') and o.status_changed_at >= p.enabled_at and o.created_at > now() - interval '12 hours'
     where p.active and p.auto_print
       and (p.categories is null or exists (
             select 1 from order_items i join menu_items m on m.id = i.menu_item_id
             where i.order_id = o.id and m.category_id = any(p.categories)))
     on conflict (dedupe_key) do nothing`);
  return r.rowCount ?? 0;
}

/** Recuperação: trabalhos "a imprimir" há mais de 60 s (o agente parou a meio) → "incerto". */
export async function recoverStuck(): Promise<number> {
  const r = await query(
    `update print_jobs set status = 'uncertain', last_error = 'O envio foi interrompido: confirme na impressora antes de reimprimir.'
     where status = 'printing' and started_at < now() - interval '60 seconds'`);
  return r.rowCount ?? 0;
}

type JobRow = { id: string; printer_id: number; order_id: string | null; kind: "order" | "reprint" | "test"; attempts: number; requested_by: string | null };

async function buildBytes(job: JobRow, p: PrinterRow): Promise<Buffer | null> {
  if (job.kind === "test") return testTicket(p.name, p.paper_width, p.codepage, connLabel(p));
  if (!job.order_id) return null;
  const o = await query<{ number: number; origin: "central" | "local"; label: string; created_at: Date; is_test: boolean }>(
    `select o.number, o.origin, t.label, o.created_at, o.is_test from orders o join dining_tables t on t.id = o.table_id where o.id = $1`, [job.order_id]);
  if (!o.rows[0]) return null;
  const items = await query<{ name: string; quantity: number; unit_price: number; note: string | null }>(
    `select i.name, i.quantity, i.unit_price, i.note from order_items i left join menu_items m on m.id = i.menu_item_id
     where i.order_id = $1 and ($2::text[] is null or m.category_id = any($2)) order by i.id`, [job.order_id, p.categories]);
  if (!items.rows.length) return null;
  const acc = await query<{ actor: string }>(
    `select actor from audit_log where entity = 'order' and entity_id = $1 and action in ('order.status','sync.status')
       and detail->>'to' = 'preparing' order by at desc limit 1`, [job.order_id]);
  const one = orderTicket({
    station: p.station, printerName: p.name, restaurant: "Nô Kau", tableLabel: o.rows[0].label,
    orderNumber: formatOrderNumber(o.rows[0].number, o.rows[0].origin), createdAt: o.rows[0].created_at.toISOString(),
    acceptedBy: acc.rows[0]?.actor ?? null, reprint: job.kind === "reprint", isTest: o.rows[0].is_test,
    items: items.rows.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, note: i.note })),
    total: items.rows.reduce((n, i) => n + i.quantity * i.unit_price, 0),
  }, p.paper_width, p.codepage);
  return Buffer.concat(Array.from({ length: job.kind === "order" ? p.copies : 1 }, () => one));
}

/** Imprime o próximo trabalho da fila (se houver). Devolve true se tratou algum. */
export async function processNext(): Promise<boolean> {
  const j = await query<JobRow>(
    `update print_jobs set status = 'printing', started_at = now(), attempts = attempts + 1
     where id = (select j.id from print_jobs j join printers p on p.id = j.printer_id
                 where j.status = 'queued' and j.next_attempt_at <= now() and p.active
                 order by j.created_at limit 1 for update of j skip locked)
     returning id, printer_id, order_id, kind, attempts, requested_by`);
  const job = j.rows[0];
  if (!job) return false;
  const p = (await query<PrinterRow>("select * from printers where id = $1", [job.printer_id])).rows[0];
  const retry = async (why: string, consume = true) => {
    const attempts = consume ? job.attempts : job.attempts - 1;
    if (attempts >= MAX_ATTEMPTS) {
      await query("update print_jobs set status = 'failed', last_error = $2 where id = $1", [job.id, why]);
    } else {
      await query(`update print_jobs set status = 'queued', attempts = $3, last_error = $2, next_attempt_at = now() + make_interval(secs => $4) where id = $1`,
        [job.id, why, attempts, BACKOFF_S[Math.min(attempts, BACKOFF_S.length) - 1] ?? 2]);
    }
  };
  try {
    const bytes = await buildBytes(job, p);
    if (!bytes) {
      await query("update print_jobs set status = 'cancelled', last_error = 'Pedido sem produtos para esta impressora.' where id = $1", [job.id]);
      return true;
    }
    // antes de enviar: a impressora diz que está sem papel ou com a tampa aberta? (só se responder ao pedido de estado)
    if (p.connection === "network") {
      const st = await probe(connOf(p));
      await saveStatus(p.id, st.reachable ? (st.paperOut ? "paper_out" : st.coverOpen ? "cover_open" : "online") : "offline", st.error);
      if (!st.reachable) { await retry(st.error ?? "Impressora inalcançável."); return true; }
      if (st.paperOut || st.coverOpen) { await retry(st.paperOut ? "Sem papel." : "Tampa aberta.", false); return true; }
    }
    await sendBytes(connOf(p), bytes);
    await query("update print_jobs set status = 'printed', printed_at = now(), last_error = null, bytes = $2 where id = $1", [job.id, bytes.length]);
    await saveStatus(p.id, "online", null);
  } catch (e) {
    await saveStatus(p.id, "offline", (e as Error).message);
    await retry((e as Error).message);
  }
  return true;
}

async function saveStatus(id: number, status: string, error: string | null) {
  await query("update printers set last_status = $2, last_status_at = now(), last_error = $3 where id = $1", [id, status, error]);
}

/** Verifica todas as impressoras ativas (estado no painel), sem imprimir. */
export async function probeAll() {
  const ps = await query<PrinterRow>("select * from printers where active");
  for (const p of ps.rows) {
    const st = await probe(connOf(p));
    await saveStatus(p.id, st.reachable ? (st.paperOut ? "paper_out" : st.coverOpen ? "cover_open" : st.paperNearEnd ? "paper_low" : "online") : "offline", st.error);
  }
}

// ---------- ações manuais ----------
export async function enqueueTest(printerId: number, actor: string) {
  await ensureMigrated();
  await query(`insert into print_jobs (printer_id, kind, requested_by) values ($1,'test',$2)`, [printerId, actor]);
}

/** Reimpressão deliberada (pedido + impressora). `key`: evita duplo toque (o mesmo pedido de reimpressão só entra uma vez). */
export async function enqueueReprint(orderId: string, printerId: number, actor: string, key: string) {
  await ensureMigrated();
  const r = await query(
    `insert into print_jobs (printer_id, order_id, kind, requested_by, dedupe_key) values ($1,$2,'reprint',$3,$4) on conflict (dedupe_key) do nothing`,
    [printerId, orderId, actor, `reprint:${key}`]);
  return (r.rowCount ?? 0) > 0;
}

export async function cancelJob(id: string) {
  await query("update print_jobs set status = 'cancelled', last_error = coalesce(last_error, 'Cancelado no painel.') where id = $1 and status in ('queued','failed','uncertain')", [id]);
}

/** Voltar a tentar um trabalho falhado/incerto (decisão do gerente). */
export async function retryJob(id: string) {
  await query("update print_jobs set status = 'queued', attempts = 0, next_attempt_at = now() where id = $1 and status in ('failed','uncertain')", [id]);
}

// ---------- ciclo ----------
const g = globalThis as unknown as { __nokauPrint?: { started: boolean } };

export function startPrintAgent() {
  if (!isPrintAgent()) return;
  g.__nokauPrint ??= { started: false };
  if (g.__nokauPrint.started) return;
  g.__nokauPrint.started = true;
  log.info("print.agent_started");
  let lastProbe = 0;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await ensureMigrated();
      await recoverStuck();
      await enqueueAccepted();
      for (let i = 0; i < 20 && (await processNext()); i++) { /* esvazia a fila */ }
      if (Date.now() - lastProbe > 20_000) { lastProbe = Date.now(); await probeAll(); }
    } catch (e) {
      log.error("print.loop_failed", errInfo(e));
    } finally {
      running = false;
      setTimeout(tick, Number(process.env.NOKAU_PRINT_INTERVAL_MS ?? 1000));
    }
  };
  // ao arrancar: o que ficou "a imprimir" de uma execução anterior passa logo a incerto (nunca é reenviado sozinho)
  query("update print_jobs set status = 'uncertain', last_error = 'O servidor reiniciou durante o envio: confirme na impressora antes de reimprimir.' where status = 'printing'")
    .catch(() => {}).finally(() => setTimeout(tick, 500));
}
