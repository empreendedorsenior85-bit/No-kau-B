import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { parseRange, reportDays, reportProducts, reportTables } from "@/lib/stats";
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
  const [days, products, tables] = await Promise.all([reportDays(range), reportProducts(range), reportTables(range)]);

  // categorias: agrupar os produtos já calculados (mesma fonte, mesmos números)
  const byCat = new Map<string, { Unidades: number; "Vendas (FCFA)": number }>();
  for (const p of products) {
    const k = String(p.Categoria);
    const cur = byCat.get(k) ?? { Unidades: 0, "Vendas (FCFA)": 0 };
    cur.Unidades += Number(p.Unidades); cur["Vendas (FCFA)"] += Number(p["Vendas (FCFA)"]);
    byCat.set(k, cur);
  }
  const cats = [...byCat.entries()].map(([Categoria, v]) => ({ Categoria, ...v })).sort((a, b) => b["Vendas (FCFA)"] - a["Vendas (FCFA)"]);

  const q = new URLSearchParams({ r: range.key });
  if (range.key === "custom") { q.set("de", range.from.toISOString().slice(0, 10)); q.set("ate", new Date(+range.to - 86_400_000).toISOString().slice(0, 10)); }
  if (range.includeTest) q.set("testes", "1");
  const csv = (tipo: string) => `/admin/relatorios/csv?tipo=${tipo}&${q}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-white">Relatórios</h1>
        <p className="mt-1 text-sm text-mist">{range.label}{range.includeTest && " · inclui pedidos de teste"} · Vendas = pedidos concluídos. Os ficheiros CSV abrem no Excel.</p>
      </div>
      <RangeFilter base="/admin/relatorios" range={range} />
      <Section title="Vendas por dia" sub="Pedidos, vendas e ticket médio de cada dia" csv={csv("dias")}>
        <ReportTable id="rep-days" rows={days} sum={["Pedidos", "Concluídos", "Vendas (FCFA)", "Unidades"]} empty="Sem pedidos neste período." />
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
      <p className="text-sm text-mist">Lista completa de pedidos (com itens e observações): <a className="text-gold-300 underline underline-offset-4" href={csv("pedidos")}>Exportar CSV</a></p>
    </div>
  );
}
