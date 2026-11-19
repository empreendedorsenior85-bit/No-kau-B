import { getManager } from "@/lib/auth";
import { isManagerRole } from "@/lib/auth-types";
import { toCsv } from "@/lib/csv";
import { REPORT_COLUMNS, parseRange, reportCategories, reportDays, reportOrders, reportProducts, reportTables } from "@/lib/stats";
import { listPayments, paymentReportRows } from "@/lib/payments";

/** Exportação CSV dos relatórios. Só para utilizadores autenticados. */
export async function GET(req: Request) {
  const m = await getManager();
  if (!m) return new Response("unauthorized", { status: 401 });
  if (!isManagerRole(m.role)) return new Response("forbidden", { status: 403 }); // Garçom: sem acesso
  const url = new URL(req.url);
  const range = parseRange(Object.fromEntries(url.searchParams));
  const tipo = url.searchParams.get("tipo") ?? "dias";
  let rows;
  if (tipo === "dias") rows = await reportDays(range);
  else if (tipo === "produtos") rows = await reportProducts(range);
  else if (tipo === "mesas") rows = await reportTables(range);
  else if (tipo === "pedidos") rows = await reportOrders(range);
  else if (tipo === "categorias") rows = reportCategories(await reportProducts(range));
  else if (tipo === "pagamentos") rows = paymentReportRows((await listPayments(range.from, range.to)).payments);
  else return new Response("bad request", { status: 400 });

  const name = `nokau-${tipo}-${range.from.toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(rows, REPORT_COLUMNS[tipo]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
