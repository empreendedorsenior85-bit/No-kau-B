"use client";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelPrintJobAction, reprintAction, retryPrintJobAction, savePrinterAction, setPrinterActiveAction, testPrintAction,
  testPrinterConnectionAction, type AdminFormState,
} from "@/app/admin/actions";
import { newKey } from "@/lib/cart";

export type PrinterView = {
  id: number; name: string; station: "kitchen" | "counter"; connection: "network" | "usb" | "bluetooth"; host: string | null; port: number; devicePath: string | null;
  paperWidth: 58 | 80; codepage: "cp860" | "cp850" | "ascii"; categories: string[] | null; autoPrint: boolean; copies: number; active: boolean;
  lastStatus: string | null; lastStatusAt: string | null; lastError: string | null;
};
export type JobView = {
  id: string; printerId: number; printerName: string; orderId: string | null; orderLabel: string | null; kind: "order" | "reprint" | "test";
  status: "queued" | "printing" | "printed" | "failed" | "uncertain" | "cancelled"; attempts: number; lastError: string | null;
  createdAt: string; printedAt: string | null; requestedBy: string | null;
};

const STATUS: Record<string, { label: string; dot: string }> = {
  online: { label: "Ligada", dot: "bg-[#7fc290]" },
  paper_low: { label: "Papel a acabar", dot: "bg-[#e0a64a]" },
  paper_out: { label: "Sem papel", dot: "bg-[#e48a7d]" },
  cover_open: { label: "Tampa aberta", dot: "bg-[#e48a7d]" },
  offline: { label: "Sem ligação", dot: "bg-[#e48a7d] animate-pulse" },
};
const JOB: Record<JobView["status"], { label: string; cls: string }> = {
  queued: { label: "Na fila", cls: "text-[#e0a64a]" },
  printing: { label: "A imprimir", cls: "text-[#8ab9e6]" },
  printed: { label: "Impresso", cls: "text-[#7fc290]" },
  failed: { label: "Falhou", cls: "text-[#e48a7d]" },
  uncertain: { label: "Incerto", cls: "text-[#e48a7d]" },
  cancelled: { label: "Cancelado", cls: "text-mist" },
};
const KIND = { order: "Pedido", reprint: "Reimpressão", test: "Teste" } as const;
const time = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Bissau" });
const field = "mt-1 h-11 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-base text-white focus:border-gold-300 focus:outline-none";

/** Atualiza a página a cada 3 s (estado das impressoras e da fila). */
function Refresher() {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) router.refresh(); }, 3000); return () => clearInterval(t); }, [router]);
  return null;
}

function PrinterForm({ printer, categories, onDone }: { printer?: PrinterView; categories: { id: string; label: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePrinterAction, {});
  const [conn, setConn] = useState<"network" | "usb" | "bluetooth">(printer?.connection ?? "network");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) { if (!printer) form.current?.reset(); router.refresh(); onDone?.(); } }, [state, printer, router, onDone]);
  return (
    // envio manual: com erro, o que o gerente escreveu fica nos campos (o React limpa o formulário depois de uma ação)
    <form ref={form} action={action} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}
      className="grid gap-4 sm:grid-cols-2" data-testid={printer ? `printer-form-${printer.id}` : "printer-form-new"}>
      {printer && <input type="hidden" name="id" value={printer.id} />}
      <label className="text-sm text-mist">Nome<input name="name" required maxLength={40} defaultValue={printer?.name} placeholder="Ex.: Cozinha" className={field} /></label>
      <label className="text-sm text-mist">Onde imprime
        <select name="station" defaultValue={printer?.station ?? "kitchen"} className={field}>
          <option value="kitchen">Cozinha</option><option value="counter">Balcão / bar</option>
        </select>
      </label>
      <label className="text-sm text-mist">Tipo de ligação
        <select name="connection" value={conn} onChange={(e) => setConn(e.target.value as "network" | "usb" | "bluetooth")} className={field}>
          <option value="network">Rede (Wi-Fi / Ethernet) — recomendado</option><option value="bluetooth">Bluetooth (emparelhada com o servidor)</option><option value="usb">USB (no computador do servidor)</option>
        </select>
      </label>
      {conn === "network" ? (
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <label className="text-sm text-mist">Endereço IP<input name="host" required defaultValue={printer?.host ?? ""} placeholder="192.168.1.50" className={field} inputMode="decimal" /></label>
          <label className="text-sm text-mist">Porta<input name="port" type="number" defaultValue={printer?.port ?? 9100} className={field} /></label>
        </div>
      ) : conn === "bluetooth" ? (
        <label className="text-sm text-mist">Porta Bluetooth
          <input key="bt" name="devicePath" required defaultValue={printer?.connection === "bluetooth" ? printer.devicePath ?? "" : "/dev/rfcomm0"} className={field} />
          <span className="mt-1 block text-xs">Primeiro emparelhe a impressora com o servidor e ligue-a a /dev/rfcomm0 (instruções em docs/impressao.md).</span>
        </label>
      ) : (
        <label className="text-sm text-mist">Dispositivo USB<input key="usb" name="devicePath" required defaultValue={printer?.connection === "usb" ? printer.devicePath ?? "" : "/dev/usb/lp0"} className={field} /></label>
      )}
      <label className="text-sm text-mist">Largura do papel
        <select name="paperWidth" defaultValue={String(printer?.paperWidth ?? 80)} className={field}>
          <option value="80">80 mm (48 colunas)</option><option value="58">58 mm (32 colunas)</option>
        </select>
      </label>
      <label className="text-sm text-mist">Acentos (tabela de caracteres)
        <select name="codepage" defaultValue={printer?.codepage ?? "cp860"} className={field}>
          <option value="cp860">PC860 — Português (recomendado)</option><option value="cp850">PC850 — Multilingue</option><option value="ascii">Sem acentos</option>
        </select>
      </label>
      <label className="text-sm text-mist">Cópias por pedido<input name="copies" type="number" min={1} max={3} defaultValue={printer?.copies ?? 1} className={field} /></label>
      <label className="flex items-center gap-2 self-end pb-3 text-sm text-white">
        <input type="checkbox" name="autoPrint" defaultChecked={printer?.autoPrint ?? true} className="h-4 w-4 accent-[#a9862c]" /> Imprimir automaticamente quando o pedido é aceite
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm text-mist">Categorias que esta impressora recebe <span className="text-xs">(nenhuma marcada = todos os produtos)</span></legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-kau-800 px-3 py-1.5 text-xs text-mist has-[:checked]:border-gold has-[:checked]:text-gold-300">
              <input type="checkbox" name="categories" value={c.id} defaultChecked={printer?.categories?.includes(c.id)} className="h-3.5 w-3.5 accent-[#a9862c]" />{c.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="h-11 rounded-full bg-gold px-6 text-sm font-medium text-kau-950 disabled:opacity-50">{pending ? "A guardar…" : printer ? "Guardar" : "Adicionar impressora"}</button>
        {(state.error || state.ok) && <p role={state.error ? "alert" : "status"} className={`text-sm ${state.error ? "text-[#e48a7d]" : "text-[#7fc290]"}`}>{state.error ?? state.ok}</p>}
      </div>
    </form>
  );
}

function PrinterCard({ p, categories }: { p: PrinterView; categories: { id: string; label: string }[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const st = STATUS[p.lastStatus ?? ""] ?? { label: "Por verificar", dot: "bg-kau-800" };
  const btn = "rounded-full border border-kau-800 px-3 py-2 text-xs text-mist hover:text-white disabled:opacity-50";
  return (
    <li className={`rounded-2xl border border-kau-800 bg-kau-900 p-4 ${p.active ? "" : "opacity-60"}`} data-testid={`printer-${p.id}`} data-status={p.lastStatus ?? ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl text-white">{p.name} <span className="text-sm text-gold-300">· {p.station === "kitchen" ? "Cozinha" : "Balcão"}</span></p>
          <p className="text-xs text-mist">{p.connection === "network" ? `Rede ${p.host}:${p.port}` : p.connection === "bluetooth" ? `Bluetooth ${p.devicePath}` : `USB ${p.devicePath}`} · {p.paperWidth} mm · {p.codepage.toUpperCase()} · {p.copies} cópia(s){p.autoPrint ? " · automático" : " · só manual"}</p>
          <p className="text-xs text-mist">{p.categories?.length ? `Categorias: ${p.categories.map((c) => categories.find((x) => x.id === c)?.label ?? c).join(", ")}` : "Todos os produtos"}</p>
        </div>
        <span className="flex items-center gap-2 text-sm text-white" data-testid="printer-status" title={p.lastError ?? ""}>
          <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} aria-hidden />{p.active ? st.label : "Desativada"}
        </span>
      </div>
      {p.lastError && p.lastStatus !== "online" && <p className="mt-2 text-xs text-[#e48a7d]">{p.lastError}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} disabled={busy} onClick={() => start(async () => { const r = await testPrinterConnectionAction(p.id); setMsg({ ok: r.ok, text: r.message }); router.refresh(); })}>Testar ligação</button>
        <button className={btn} disabled={busy || !p.active} onClick={() => start(async () => { const r = await testPrintAction(p.id); setMsg({ ok: !!r.ok, text: r.ok ?? r.error ?? "" }); router.refresh(); })}>Imprimir teste</button>
        <button className={btn} onClick={() => setEdit((v) => !v)}>{edit ? "Fechar" : "Editar"}</button>
        <button className={btn} disabled={busy} onClick={() => start(async () => { await setPrinterActiveAction(p.id, !p.active); router.refresh(); })}>{p.active ? "Desativar" : "Ativar"}</button>
      </div>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-[#7fc290]" : "text-[#e48a7d]"}`} data-testid="printer-msg">{msg.text}</p>}
      {edit && <div className="mt-4 border-t border-kau-800 pt-4"><PrinterForm printer={p} categories={categories} onDone={() => setEdit(false)} /></div>}
    </li>
  );
}

function JobRow({ j }: { j: JobView }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const btn = "rounded-full border border-kau-800 px-2.5 py-1 text-xs text-mist hover:text-white disabled:opacity-50";
  return (
    <tr className="border-t border-kau-800 align-top" data-testid={`job-${j.id}`} data-status={j.status} data-kind={j.kind}>
      <td className="py-2 pr-3 text-mist">{time(j.createdAt)}</td>
      <td className="py-2 pr-3 text-white">{KIND[j.kind]}{j.orderLabel ? ` · ${j.orderLabel}` : ""}</td>
      <td className="py-2 pr-3 text-white">{j.printerName}</td>
      <td className={`py-2 pr-3 font-medium ${JOB[j.status].cls}`}>{JOB[j.status].label}{j.attempts > 1 ? ` (${j.attempts} tentativas)` : ""}
        {j.lastError && j.status !== "printed" && <span className="block text-xs font-normal text-mist">{j.lastError}</span>}
      </td>
      <td className="py-2 pr-3 text-mist">{j.printedAt ? time(j.printedAt) : "—"}</td>
      <td className="py-2">
        <div className="flex flex-wrap gap-1.5">
          {j.orderId && (j.status === "printed" || j.status === "cancelled") && (
            <button className={btn} disabled={busy} onClick={() => start(async () => { await reprintAction(j.orderId!, j.printerId, newKey()); router.refresh(); })}>Reimprimir</button>
          )}
          {(j.status === "failed" || j.status === "uncertain") && (
            <button className={btn} disabled={busy} onClick={() => start(async () => { await retryPrintJobAction(j.id); router.refresh(); })}>{j.status === "uncertain" ? "Imprimir de novo" : "Tentar de novo"}</button>
          )}
          {(j.status === "queued" || j.status === "failed" || j.status === "uncertain") && (
            <button className={btn} disabled={busy} onClick={() => start(async () => { await cancelPrintJobAction(j.id); router.refresh(); })}>Cancelar</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function PrintersManager({ printers, categories, jobs }: { printers: PrinterView[]; categories: { id: string; label: string }[]; jobs: JobView[] }) {
  const attention = jobs.filter((j) => j.status === "failed" || j.status === "uncertain").length;
  const queued = jobs.filter((j) => j.status === "queued" || j.status === "printing").length;
  return (
    <div className="space-y-10">
      <Refresher />
      <section aria-labelledby="imp" className="space-y-3">
        <h2 id="imp" className="font-display text-2xl text-white">Impressoras ({printers.length})</h2>
        {printers.length === 0
          ? <p className="rounded-2xl border border-dashed border-kau-800 p-6 text-center text-sm text-mist">Ainda não há impressoras. Adicione a da cozinha e a do balcão abaixo — ou siga o <a href="/admin/ajuda/impressora" className="text-gold-300 underline underline-offset-4">tutorial passo a passo</a>.</p>
          : <ul className="grid gap-3 lg:grid-cols-2">{printers.map((p) => <PrinterCard key={p.id} p={p} categories={categories} />)}</ul>}
      </section>
      <section aria-labelledby="nova" className="space-y-3">
        <h2 id="nova" className="font-display text-2xl text-white">Adicionar impressora</h2>
        <div className="rounded-2xl border border-kau-800 bg-kau-900 p-4"><PrinterForm categories={categories} /></div>
      </section>
      <section aria-labelledby="fila" className="space-y-3">
        <h2 id="fila" className="font-display text-2xl text-white">Fila e histórico</h2>
        <p className="text-sm text-mist" data-testid="queue-summary">
          {queued} na fila · {attention} a precisar de atenção · os talões saem sozinhos quando um pedido é <strong className="text-white">aceite</strong> (Iniciar preparação).
        </p>
        {jobs.length === 0 ? <p className="text-sm text-mist">Ainda não houve impressões.</p> : (
          <div className="overflow-x-auto rounded-xl border border-kau-800">
            <table className="w-full min-w-[46rem] text-left text-sm" data-testid="print-jobs">
              <thead className="bg-kau-900 text-xs uppercase tracking-wider text-mist"><tr>
                <th className="px-3 py-2 font-normal">Pedido em</th><th className="py-2 pr-3 font-normal">O quê</th><th className="py-2 pr-3 font-normal">Impressora</th>
                <th className="py-2 pr-3 font-normal">Estado</th><th className="py-2 pr-3 font-normal">Impresso em</th><th className="py-2 font-normal">Ações</th>
              </tr></thead>
              <tbody className="[&_td:first-child]:px-3">{jobs.map((j) => <JobRow key={j.id} j={j} />)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
