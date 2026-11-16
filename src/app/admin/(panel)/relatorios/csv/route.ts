import { getManager } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { parseRange, reportDays, reportOrders, reportProducts, reportTables } from "@/lib/stats";

/** Exportação CSV dos relatórios. Só para utilizadores autenticados. */
export async function GET(req: Request) {
  if (!(await getManager())) return new Response("unauthorized", { status: 401 });
  const url = new URL(req.url);
  const range = parseRange(Object.fromEntries(url.searchParams));
  const tipo = url.searchParams.get("tipo") ?? "dias";
  let rows;
  if (tipo === "dias") rows = await reportDays(range);
  else if (tipo === "produtos") rows = await reportProducts(range);
  else if (tipo === "mesas") rows = await reportTables(range);
  else if (tipo === "pedidos") rows = await reportOrders(range);
  else if (tipo === "categorias") {
    const prods = await reportProducts(range);
    const m = new Map<string, { Unidades: number; "Vendas (FCFA)": number }>();
    for (const p of prods) { const c = m.get(String(p.Categoria)) ?? { Unidades: 0, "Vendas (FCFA)": 0 }; c.Unidades += Number(p.Unidades); c["Vendas (FCFA)"] += Number(p["Vendas (FCFA)"]); m.set(String(p.Categoria), c); }
    rows = [...m.entries()].map(([Categoria, v]) => ({ Categoria, ...v })).sort((a, b) => b["Vendas (FCFA)"] - a["Vendas (FCFA)"]);
  } else return new Response("bad request", { status: 400 });

  const name = `nokau-${tipo}-${range.from.toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
