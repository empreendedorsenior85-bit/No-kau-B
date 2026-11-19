import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { parseRange, reportCategories, reportDays, reportProducts, reportTables } from "@/lib/stats";
import { listPayments, paymentReportRows } from "@/lib/payments";
import { RangeFilter } from "@/components/admin/RangeFilter";
import { ReportTable } from "@/components/admin/ReportTable";

export const metadata: Metadata = { title: "Relatórios" };

function Section({ title, sub, csv, children }: { title: string; sub: string; csv: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-display text-2xl text-white">{title}</h2><p className="text-xs text-mist">{sub}</p></div>
        <a href={csv} className="rounded-full border border-gold/60 px-4 py-2 text-sm text-gold-300 hover:bg-gold/10 print:hidden">Exportar CSV</a>
      </div>
      {children}
    </section>
  );
}

export default async function Page({ searchParams }: PageProps<"/admin/relatorios">) {
  await requireManager();
  const sp = await searchParams;
  const range = parseRange(sp);
  const [days, products, tables, pay] = await Promise.all([reportDays(range), reportProducts(range), reportTables(range), listPayments(range.from, range.to)]);

  const cats = reportCategories(products); // mesma fonte, mesmos números
  const payRows = paymentReportRows(pay.payments).map(({ ["Pedidos"]: _p, ["Entregue (FCFA)"]: _e, ["Troco (FCFA)"]: _t, ...r }) => { void _p; void _e; void _t; return r; });

  const q = new URLSearchParams({ r: range.key });
  if (range.key === "custom") { q.set("de", range.from.toISOString().slice(0, 10)); q.set("ate", new Date(+range.to - 86_400_000).toISOString().slice(0, 10)); }
  if (range.includeTest) q.set("testes", "1");
  const csv = (tipo: string) => `/admin/relatorios/csv?tipo=${tipo}&${q}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-white">Relatórios</h1>
          <p className="mt-1 text-sm text-mist">{range.label}{range.includeTest && " · inclui pedidos de teste"} · Vendas = pedidos concluídos ou pagos ou pagos. Os ficheiros CSV abrem no Excel.</p>
        </div>
        <a href={`/admin/relatorios/pdf?${q}`} data-testid="report-pdf" className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-kau-950 hover:bg-gold-300 print:hidden">
          Descarregar PDF
        </a>
      </div>
      <RangeFilter base="/admin/relatorios" range={range} />
      <Section title="Vendas por dia" sub="Pedidos, vendas e ticket médio de cada dia" csv={csv("dias")}>
        <ReportTable id="rep-days" rows={days} sum={["Pedidos", "Concluídos", "Vendidos", "Vendas (FCFA)", "Unidades"]} empty="Sem pedidos neste período." />
      </Section>
      <Section title="Produtos" sub="Unidades e vendas por produto" csv={csv("produtos")}>
        <ReportTable id="rep-products" rows={products} sum={["Unidades", "Vendas (FCFA)"]} empty="Sem vendas concluídas neste período." />
      </Section>
      <Section title="Categorias" sub="Vendas por categoria do menu" csv={csv("categorias")}>
        <ReportTable id="rep-categories" rows={cats} sum={["Unidades", "Vendas (FCFA)"]} empty="Sem vendas concluídas neste período." />
      </Section>
      <Section title="Mesas" sub="Pedidos e vendas por mesa" csv={csv("mesas")}>
        <ReportTable id="rep-tables" rows={tables} sum={["Pedidos", "Concluídos", "Vendas (FCFA)"]} empty="Sem pedidos neste período." />
      </Section>
      <Section title="Pagamentos" sub="Todos os pagamentos do período (os anulados mostram o motivo e não contam no recebido)" csv={csv("pagamentos")}>
        <ReportTable id="rep-payments" rows={payRows} sum={["Recebido (FCFA)"]} empty="Sem pagamentos neste período." />
      </Section>
      <p className="text-sm text-mist">Lista completa de pedidos (com itens e observações): <a className="text-gold-300 underline underline-offset-4" href={csv("pedidos")}>Exportar CSV</a></p>
    </div>
  );
}
