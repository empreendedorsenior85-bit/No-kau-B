import { getManager } from "@/lib/auth";
import { isManagerRole } from "@/lib/auth-types";
import { parseRange, reportCategories, reportDays, reportProducts, reportTables } from "@/lib/stats";
import { listPayments } from "@/lib/payments";
import { buildReportPdf } from "@/lib/pdf/report-pdf";
import { formatXOF } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/types";
import { errInfo, log } from "@/lib/log";

export const maxDuration = 30;

/** Relatório completo em PDF (os mesmos números da página Relatórios). Só Admin e Gerente. */
export async function GET(req: Request) {
  const m = await getManager();
  if (!m) return new Response("unauthorized", { status: 401 });
  if (!isManagerRole(m.role)) return new Response("forbidden", { status: 403 }); // Garçom: sem acesso
  const range = parseRange(Object.fromEntries(new URL(req.url).searchParams));
  try {
    const [days, products, tables, pay] = await Promise.all([reportDays(range), reportProducts(range), reportTables(range), listPayments(range.from, range.to)]);
    const n = (rows: typeof days, k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const orders = n(days, "Pedidos"), done = n(days, "Concluídos"), sales = n(days, "Vendas (FCFA)");
    const pdf = await buildReportPdf({
      periodLabel: range.label, includeTest: range.includeTest, generatedBy: m.name ?? m.email,
      kpis: [
        { label: "Vendas (pedidos concluídos)", value: formatXOF(sales) },
        { label: "Pedidos / concluídos", value: `${orders} / ${done}` },
        { label: "Ticket médio", value: formatXOF(done ? Math.round(sales / done) : 0) },
        { label: "Pagamentos recebidos", value: formatXOF(pay.summary.total) },
        { label: "Nº de pagamentos", value: `${pay.summary.count}${pay.summary.voided ? ` (+${pay.summary.voided} anulados)` : ""}` },
        { label: "Unidades vendidas", value: String(n(days, "Unidades")) },
      ],
      sections: [
        { title: "Vendas por dia", sub: "Pedidos, vendas e ticket médio de cada dia", rows: days, sum: ["Pedidos", "Concluídos", "Vendas (FCFA)", "Unidades"], empty: "Sem pedidos neste período." },
        { title: "Produtos", sub: "Unidades e vendas por produto", rows: products, sum: ["Unidades", "Vendas (FCFA)"], empty: "Sem vendas concluídas neste período." },
        { title: "Categorias", sub: "Vendas por categoria do menu", rows: reportCategories(products), sum: ["Unidades", "Vendas (FCFA)"], empty: "Sem vendas concluídas neste período." },
        { title: "Mesas", sub: "Pedidos e vendas por mesa", rows: tables, sum: ["Pedidos", "Concluídos", "Vendas (FCFA)"], empty: "Sem pedidos neste período." },
        {
          title: "Pagamentos por método", sub: "Pagamentos confirmados (os anulados não contam)",
          rows: pay.summary.byMethod.map((x) => ({ "Método": PAYMENT_LABEL[x.method], Pagamentos: x.count, "Recebido (FCFA)": x.total })),
          sum: ["Pagamentos", "Recebido (FCFA)"], empty: "Sem pagamentos neste período.",
        },
      ],
    });
    const name = `nokau-relatorio-${range.from.toISOString().slice(0, 10)}_${new Date(+range.to - 86_400_000).toISOString().slice(0, 10)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    log.error("report.pdf_failed", errInfo(e));
    return new Response("Não foi possível gerar o PDF. Tente novamente.", { status: 500 });
  }
}
