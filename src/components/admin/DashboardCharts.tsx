"use client";
import type { Dashboard } from "@/lib/stats";
import { LineChart } from "@/components/charts/LineChart";
import { Columns } from "@/components/charts/Columns";
import { RankedBars } from "@/components/charts/RankedBars";
import { int } from "@/components/charts/chart-utils";
import { formatXOF } from "@/lib/format";

const TZ = "Africa/Bissau";
const fDay = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", timeZone: TZ });
const fDayLong = new Intl.DateTimeFormat("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ });
const fHour = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

function Card({ title, sub, children, id }: { title: string; sub?: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="rounded-2xl border border-kau-800 bg-kau-900 p-5" data-testid={id}>
      <h2 className="font-display text-xl text-white">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-mist">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SalesChart({ d }: { d: Dashboard }) {
  const hourly = d.range.bucket === "hour";
  const fmtX = (iso: string) => (hourly ? `${new Date(iso).getUTCHours()}h` : fDay.format(new Date(iso)));
  const fmtTip = (iso: string, prevIso?: string) => {
    const a = hourly ? fHour.format(new Date(iso)) : fDayLong.format(new Date(iso));
    return prevIso ? `${a} (período anterior: ${hourly ? fHour.format(new Date(prevIso)) : fDayLong.format(new Date(prevIso))})` : a;
  };
  const prevName = d.range.key === "hoje" ? "Ontem" : d.range.key === "ontem" ? "Dia anterior" : "Período anterior";
  return (
    <Card title="Vendas ao longo do tempo" sub={`Vendas concluídas em FCFA · ${d.range.label}`} id="chart-sales">
      <LineChart
        unit="vendas em FCFA"
        labels={d.series.map((p) => fmtX(p.t))}
        tooltipLabels={d.series.map((p, i) => fmtTip(p.t, d.previousSeries[i]?.t))}
        format={(n) => formatXOF(n)}
        series={[
          { name: d.range.label, kind: "accent", values: d.series.map((p) => p.revenue) },
          { name: prevName, kind: "muted", values: d.previousSeries.map((p) => p.revenue) },
        ]}
      />
    </Card>
  );
}

export function OrdersChart({ d }: { d: Dashboard }) {
  const hourly = d.range.bucket === "hour";
  return (
    <Card title="Pedidos ao longo do tempo" sub={`Todos os pedidos recebidos · ${d.range.label}`} id="chart-orders">
      <LineChart
        unit="número de pedidos"
        labels={d.series.map((p) => (hourly ? `${new Date(p.t).getUTCHours()}h` : fDay.format(new Date(p.t))))}
        tooltipLabels={d.series.map((p) => (hourly ? fHour.format(new Date(p.t)) : fDayLong.format(new Date(p.t))))}
        format={(n) => `${int(n)} ${n === 1 ? "pedido" : "pedidos"}`}
        height={200}
        series={[{ name: "Pedidos", kind: "accent", values: d.series.map((p) => p.orders) }]}
      />
    </Card>
  );
}

export function HoursChart({ d }: { d: Dashboard }) {
  const total = d.hours.reduce((s, h) => s + h.orders, 0);
  return (
    <Card title="Horas de maior movimento" sub="Pedidos por hora do dia (todo o período)" id="chart-hours">
      {total === 0 ? <p className="rounded-xl border border-dashed border-kau-800 py-8 text-center text-sm text-mist">Sem pedidos neste período.</p> : (
        <Columns unitOne="pedido" unitMany="pedidos" data={d.hours.map((h) => ({ label: `${h.hour}h`, sub: `${String(h.hour).padStart(2, "0")}h – ${String((h.hour + 1) % 24).padStart(2, "0")}h`, value: h.orders }))} />
      )}
    </Card>
  );
}

export function ProductsChart({ d }: { d: Dashboard }) {
  return (
    <Card title="Produtos mais vendidos" sub="Por vendas concluídas (FCFA)" id="chart-products">
      <RankedBars empty="Sem vendas concluídas neste período." rows={d.products.map((p) => ({ label: p.name, value: p.revenue, display: formatXOF(p.revenue), hint: `${int(p.qty)} unidades` }))} />
    </Card>
  );
}

export function CategoriesChart({ d }: { d: Dashboard }) {
  return (
    <Card title="Vendas por categoria" sub="Vendas concluídas (FCFA)" id="chart-categories">
      <RankedBars empty="Sem vendas concluídas neste período." rows={d.categories.map((c) => ({ label: c.label, value: c.revenue, display: formatXOF(c.revenue), hint: `${int(c.qty)} unidades` }))} />
    </Card>
  );
}

export function TablesChart({ d }: { d: Dashboard }) {
  return (
    <Card title="Mesas" sub="Vendas concluídas por mesa (FCFA)" id="chart-tables">
      <RankedBars empty="Sem pedidos neste período." rows={d.tables.map((t) => ({ label: t.label, value: t.revenue, display: formatXOF(t.revenue), hint: `${int(t.orders)} pedidos` }))} />
    </Card>
  );
}
