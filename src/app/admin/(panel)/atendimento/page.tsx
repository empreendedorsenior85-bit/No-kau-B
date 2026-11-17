import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { parseRange } from "@/lib/stats";
import { callHistory, callStats } from "@/lib/calls";
import { RangeFilter } from "@/components/admin/RangeFilter";
import { ReportTable } from "@/components/admin/ReportTable";
import { CALL_SHORT, CALL_STATUS_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "Atendimento" };

const dur = (s: number | null) => (s == null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`);
const hhmm = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-kau-800 bg-kau-900 p-4">
      <p className="text-xs uppercase tracking-wider text-mist">{label}</p>
      <p className="mt-1 font-display text-3xl text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-mist">{hint}</p>}
    </div>
  );
}

/** Histórico de atendimento: chamadas dos clientes, quem respondeu e em quanto tempo. */
export default async function Page({ searchParams }: PageProps<"/admin/atendimento">) {
  await requireManager();
  const range = parseRange(await searchParams);
  const [stats, rows] = await Promise.all([callStats(range.from, range.to), callHistory(range.from, range.to)]);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-white">Atendimento</h1>
        <p className="text-sm text-mist">Chamadas dos clientes (empregado, gerente, conta), tempo de resposta e quem atendeu — {range.label.toLowerCase()}.</p>
      </div>
      <RangeFilter base="/admin/atendimento" range={range} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="service-kpis">
        <Kpi label="Chamadas" value={String(stats.total)} hint={`${stats.waiter} empregado · ${stats.bill} conta · ${stats.manager} gerente`} />
        <Kpi label="Tempo médio de resposta" value={dur(stats.avgAck)} hint="até alguém tocar em “A caminho”" />
        <Kpi label="Respondidas em ≤ 2 min" value={stats.within2min == null ? "—" : `${stats.within2min}%`} hint="sem contar as canceladas" />
        <Kpi label="Por resolver" value={String(stats.unresolved)} hint={`${stats.cancelled} canceladas pelo cliente`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-2xl text-white">Por pessoa</h2>
          <ReportTable id="por-pessoa" empty="Ainda ninguém respondeu a chamadas neste período."
            rows={stats.byPerson.map((p) => ({ Pessoa: p.pessoa, Atendidas: p.atendidas, "Resposta média": dur(p.mediaResposta), "Resolução média": dur(p.mediaResolucao) }))} />
        </div>
        <div className="space-y-3">
          <h2 className="font-display text-2xl text-white">Por mesa</h2>
          <ReportTable id="por-mesa" empty="Sem chamadas neste período."
            rows={stats.byTable.map((t) => ({ Mesa: t.mesa, Chamadas: t.chamadas, "Resposta média": dur(t.mediaResposta) }))} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-white">Histórico</h2>
        <p className="text-xs text-mist">As 500 chamadas mais recentes do período.</p>
        <ReportTable id="historico-chamadas" empty="Sem chamadas neste período."
          rows={rows.map((c) => ({
            Hora: hhmm(c.createdAt), Mesa: c.tableLabel, Tipo: CALL_SHORT[c.kind], Estado: CALL_STATUS_LABEL[c.status],
            "Respondeu": c.ackBy ?? "—", "Resposta": dur(c.ackSeconds), "Resolvida em": dur(c.doneSeconds),
            "Garçom da mesa": c.waiterName ?? "—",
          }))} />
      </section>
    </div>
  );
}
