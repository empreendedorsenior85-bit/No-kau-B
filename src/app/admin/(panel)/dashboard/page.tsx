import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { getDashboard, parseRange } from "@/lib/stats";
import { formatXOF } from "@/lib/format";
import { int } from "@/components/charts/chart-utils";
import { StatTile, DeltaBadge } from "@/components/charts/StatTile";
import { RangeFilter } from "@/components/admin/RangeFilter";
import { LiveNow } from "@/components/admin/LiveNow";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import Link from "next/link";
import { listPayments } from "@/lib/payments";
import { CategoriesChart, HoursChart, OrdersChart, ProductsChart, SalesChart, TablesChart } from "@/components/admin/DashboardCharts";

export const metadata: Metadata = { title: "Visão geral" };

export default async function Page({ searchParams }: PageProps<"/admin/dashboard">) {
  await requireManager();
  const range = parseRange(await searchParams);
  const [d, pay] = await Promise.all([getDashboard(range), listPayments(range.from, range.to)]);
  const c = d.current, p = d.previous;
  const ordersTrend = d.series.map((x) => x.orders);

  return (
    <div className="space-y-6" data-range={range.key}>
      <AutoRefresh />
      <div>
        <h1 className="font-display text-3xl text-white">Visão geral</h1>
        <p className="mt-1 text-sm text-mist">Todos os números vêm da base de dados do restaurante. Vendas = pedidos concluídos ou pagos ou pagos.</p>
      </div>
      <RangeFilter base="/admin/dashboard" range={range} />

      {/* Indicador principal */}
      <section className="relative overflow-hidden rounded-[1.75rem] border border-kau-800 bg-gradient-to-br from-kau-900 to-kau-950 p-6 sm:p-8" aria-label="Vendas do período">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-sm text-mist">Vendas · {range.label}{range.includeTest && " (inclui testes)"}</p>
            <p className="mt-2 font-sans text-5xl font-semibold tabular-nums text-white sm:text-6xl" data-testid="hero-revenue" data-raw={c.revenue}>{formatXOF(c.revenue)}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-mist"><DeltaBadge cur={c.revenue} prev={p.revenue} /> vs período anterior ({formatXOF(p.revenue)})</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:text-right">
            <div><dt className="text-mist">Pedidos concluídos</dt><dd className="font-sans text-2xl font-semibold tabular-nums text-white" data-testid="hero-done">{int(c.done)}</dd></div>
            <div><dt className="text-mist">Em curso</dt><dd className="font-sans text-2xl font-semibold tabular-nums text-white" data-testid="hero-inprogress">{int(c.inProgress)}</dd></div>
            <div className="col-span-2">
              <dt className="text-mist">Pagamentos recebidos</dt>
              <dd className="font-sans text-2xl font-semibold tabular-nums text-[#7fc290]">
                <Link href={`/admin/pagamentos?r=${range.key}`} data-testid="hero-paid" data-raw={pay.summary.total} className="hover:underline">
                  {formatXOF(pay.summary.total)} <span className="text-sm font-normal text-mist">({int(pay.summary.count)})</span>
                </Link>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile testId="tile-orders" label="Pedidos recebidos" value={int(c.orders)} cur={c.orders} prev={p.orders} trend={ordersTrend} />
        <StatTile testId="tile-ticket" label="Ticket médio" value={formatXOF(c.avgTicket)} cur={c.avgTicket} prev={p.avgTicket} sub="por pedido concluído" />
        <StatTile testId="tile-units" label="Unidades vendidas" value={int(c.units)} cur={c.units} prev={p.units} />
        <StatTile testId="tile-tables" label="Mesas com pedidos" value={int(c.tables)} cur={c.tables} prev={p.tables} sub="mesas distintas no período" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <SalesChart d={d} />
          <OrdersChart d={d} />
        </div>
        <LiveNow />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProductsChart d={d} />
        <CategoriesChart d={d} />
        <HoursChart d={d} />
        <TablesChart d={d} />
      </div>
      <p className="text-xs text-mist">Atualizado às {new Date(d.generatedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" })} · atualiza sozinho quando entra ou muda um pedido.</p>
    </div>
  );
}
