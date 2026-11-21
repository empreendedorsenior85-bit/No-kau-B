import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/db/init";
import { isPrintAgent, type PrinterRow } from "@/lib/print/agent";
import { PrintersManager, type JobView } from "@/components/admin/PrintersManager";
import { formatOrderNumber } from "@/lib/types";
import Link from "next/link";

export const metadata: Metadata = { title: "Impressoras" };

/** Impressoras da cozinha e do balcão, fila de impressão e histórico (no servidor do restaurante). */
export default async function Page() {
  await requireManager();
  if (!isPrintAgent()) {
    return (
      <div className="max-w-3xl space-y-4" data-testid="print-central-notice">
        <h1 className="font-display text-3xl text-white">Impressoras</h1>
      <Link href="/admin/ajuda/impressora" data-testid="printer-tutorial-link"
        className="flex items-center gap-4 rounded-2xl border border-gold/60 bg-gold/10 p-4 hover:bg-gold/15">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-2xl">🖨</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl text-white">Primeira vez? Tutorial passo a passo</span>
          <span className="block text-sm text-mist">Como ligar a impressora (cabo, Wi-Fi, USB ou Bluetooth), escolher o papel, imprimir um teste e resolver problemas.</span>
        </span>
        <span aria-hidden className="text-gold-300">→</span>
      </Link>
        <p className="rounded-2xl border border-gold/40 bg-gold/5 p-5 text-sm leading-relaxed text-gold-300">
          A impressão automática dos talões é feita pelo <strong>servidor local do restaurante</strong> (o computador ligado ao router):
          só ele chega às impressoras da rede Wi-Fi/Ethernet ou USB — o site na internet não as alcança.
          Abra este painel no servidor local (ex.: <code>http://192.168.1.10:3000/admin/impressoras</code>) para configurar as impressoras,
          ver a fila e reimprimir. Instalação: <code>docs/impressao.md</code>.
        </p>
      </div>
    );
  }
  await ensureMigrated();
  const [printers, cats, jobs] = await Promise.all([
    query<PrinterRow>("select * from printers order by active desc, station, name"),
    query<{ id: string; label: string }>("select id, label from menu_categories where active order by position, id"),
    query<{ id: string; printer_id: number; printer_name: string; order_id: string | null; number: number | null; origin: "central" | "local" | null; table_label: string | null;
      kind: JobView["kind"]; status: JobView["status"]; attempts: number; last_error: string | null; created_at: Date; printed_at: Date | null; requested_by: string | null }>(
      `select j.id, j.printer_id, p.name printer_name, j.order_id, o.number, o.origin, t.label table_label, j.kind, j.status, j.attempts, j.last_error,
              j.created_at, j.printed_at, j.requested_by
       from print_jobs j join printers p on p.id = j.printer_id left join orders o on o.id = j.order_id left join dining_tables t on t.id = o.table_id
       order by j.created_at desc limit 150`),
  ]);
  return (
    <>
      <h1 className="mb-1 font-display text-3xl text-white">Impressoras</h1>
      <p className="mb-4 text-sm text-mist">Talões automáticos para a cozinha e o balcão (impressoras térmicas ESC/POS, 58 ou 80 mm, em rede ou USB).</p>
      <div className="mb-6">
      <Link href="/admin/ajuda/impressora" data-testid="printer-tutorial-link"
        className="flex items-center gap-4 rounded-2xl border border-gold/60 bg-gold/10 p-4 hover:bg-gold/15">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-2xl">🖨</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl text-white">Primeira vez? Tutorial passo a passo</span>
          <span className="block text-sm text-mist">Como ligar a impressora (cabo, Wi-Fi, USB ou Bluetooth), escolher o papel, imprimir um teste e resolver problemas.</span>
        </span>
        <span aria-hidden className="text-gold-300">→</span>
      </Link>
      </div>
      <PrintersManager
        categories={cats.rows}
        printers={printers.rows.map((p) => ({
          id: p.id, name: p.name, station: p.station, connection: p.connection, host: p.host, port: p.port, devicePath: p.device_path,
          paperWidth: p.paper_width, codepage: p.codepage, categories: p.categories, autoPrint: p.auto_print, copies: p.copies, active: p.active,
          lastStatus: p.last_status, lastStatusAt: p.last_status_at?.toISOString() ?? null, lastError: p.last_error,
        }))}
        jobs={jobs.rows.map((j) => ({
          id: j.id, printerId: j.printer_id, printerName: j.printer_name, orderId: j.order_id,
          orderLabel: j.number != null ? `${formatOrderNumber(j.number, j.origin ?? "central")} · ${j.table_label}` : null,
          kind: j.kind, status: j.status, attempts: j.attempts, lastError: j.last_error, createdAt: j.created_at.toISOString(),
          printedAt: j.printed_at?.toISOString() ?? null, requestedBy: j.requested_by,
        }))}
      />
    </>
  );
}
