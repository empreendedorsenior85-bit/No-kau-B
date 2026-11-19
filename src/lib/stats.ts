import "server-only";
import { formatOrderNumber } from "./types";
import { query } from "./db";

/**
 * Estatísticas do painel — TODAS calculadas por consultas à base de dados.
 *
 * Definições (iguais em todo o painel):
 *  - Pedidos: todos os pedidos criados no período.
 *  - Vendas: soma do total dos pedidos CONCLUÍDOS (pedidos em curso ainda não são venda).
 *  - Ticket médio: vendas ÷ pedidos concluídos.
 *  - Unidades: soma das quantidades dos pedidos concluídos.
 *  - Pedidos de teste (produtos de demonstração) ficam de fora, salvo se o gerente os incluir.
 * Fuso horário: Africa/Bissau (UTC+0, sem horário de verão).
 */
const DAY = 86_400_000;
const TZ = "Africa/Bissau";

export type RangeKey = "hoje" | "ontem" | "7d" | "30d" | "mes" | "custom";
export type Range = { key: RangeKey; from: Date; to: Date; days: number; label: string; includeTest: boolean };

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const validDay = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? new Date(`${s}T00:00:00Z`) : null);

export const RANGE_LABEL: Record<Exclude<RangeKey, "custom">, string> = {
  hoje: "Hoje", ontem: "Ontem", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", mes: "Este mês",
};

/** Lê o período dos parâmetros do URL. `to` é exclusivo. Limite de 180 dias. */
export function parseRange(sp: Record<string, string | string[] | undefined>, now = new Date()): Range {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const today = startOfDay(now);
  const includeTest = get("testes") === "1";
  const r = (get("r") ?? "7d") as RangeKey;
  const mk = (key: RangeKey, from: Date, to: Date, label: string): Range =>
    ({ key, from, to, days: Math.max(1, Math.round((+to - +from) / DAY)), label, includeTest });

  if (r === "custom") {
    const a = validDay(get("de")), b = validDay(get("ate"));
    if (a && b && +b >= +a) {
      const to = new Date(+b + DAY);
      const from = +to - +a > 180 * DAY ? new Date(+to - 180 * DAY) : a;
      return mk("custom", from, to, `${iso(from)} → ${iso(b)}`);
    }
  }
  if (r === "hoje") return mk("hoje", today, new Date(+today + DAY), RANGE_LABEL.hoje);
  if (r === "ontem") return mk("ontem", new Date(+today - DAY), today, RANGE_LABEL.ontem);
  if (r === "30d") return mk("30d", new Date(+today - 29 * DAY), new Date(+today + DAY), RANGE_LABEL["30d"]);
  if (r === "mes") return mk("mes", new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), new Date(+today + DAY), RANGE_LABEL.mes);
  return mk("7d", new Date(+today - 6 * DAY), new Date(+today + DAY), RANGE_LABEL["7d"]);
}

/** Período anterior com a mesma duração (para comparar). */
export const previousRange = (r: Range): { from: Date; to: Date } => ({ from: new Date(+r.from - (+r.to - +r.from)), to: r.from });

export type Summary = { orders: number; done: number; inProgress: number; revenue: number; avgTicket: number; units: number; tables: number };
export type SeriesPoint = { t: string; revenue: number; orders: number };
export type Dashboard = {
  range: { key: RangeKey; label: string; from: string; to: string; days: number; includeTest: boolean; bucket: "hour" | "day" };
  current: Summary; previous: Summary;
  series: SeriesPoint[]; previousSeries: SeriesPoint[];
  hours: { hour: number; orders: number }[];
  products: { name: string; qty: number; revenue: number }[];
  categories: { label: string; qty: number; revenue: number }[];
  tables: { label: string; orders: number; revenue: number }[];
  generatedAt: string;
};

type P = [Date, Date, boolean];
const sel = "o.created_at >= $1 and o.created_at < $2 and ($3 or not o.is_test)";

async function summary(from: Date, to: Date, test: boolean): Promise<Summary> {
  const p: P = [from, to, test];
  const o = await query<{ orders: string; done: string; in_progress: string; revenue: string; tables: string }>(
    `select count(*) orders,
            count(*) filter (where o.status = 'done') done,
            count(*) filter (where o.status <> 'done') in_progress,
            coalesce(sum(o.total) filter (where o.status = 'done'), 0) revenue,
            count(distinct o.table_id) tables
     from orders o where ${sel}`, p);
  const u = await query<{ units: string }>(
    `select coalesce(sum(i.quantity), 0) units from order_items i join orders o on o.id = i.order_id
     where o.status = 'done' and ${sel}`, p);
  const r = o.rows[0];
  const done = Number(r.done), revenue = Number(r.revenue);
  return { orders: Number(r.orders), done, inProgress: Number(r.in_progress), revenue, avgTicket: done ? Math.round(revenue / done) : 0, units: Number(u.rows[0].units), tables: Number(r.tables) };
}

async function series(from: Date, to: Date, test: boolean, step: "1 hour" | "1 day"): Promise<SeriesPoint[]> {
  const r = await query<{ t: Date; revenue: string; orders: string }>(
    `select g.t, coalesce(sum(o.total) filter (where o.status = 'done'), 0) revenue, count(o.id) orders
     from generate_series($1::timestamptz, $2::timestamptz - interval '1 second', $4::interval) g(t)
     left join orders o on o.created_at >= g.t and o.created_at < g.t + $4::interval and ($3 or not o.is_test)
     group by g.t order by g.t`, [from, to, test, step]);
  return r.rows.map((x) => ({ t: x.t.toISOString(), revenue: Number(x.revenue), orders: Number(x.orders) }));
}

export async function getDashboard(range: Range): Promise<Dashboard> {
  const { from, to, includeTest: test } = range;
  const prev = previousRange(range);
  const bucket = range.days <= 1 ? "hour" : "day";
  const step = bucket === "hour" ? "1 hour" : "1 day";
  const p: P = [from, to, test];

  const [current, previous, cur, prv, hours, products, categories, tables] = await Promise.all([
    summary(from, to, test),
    summary(prev.from, prev.to, test),
    series(from, to, test, step),
    series(prev.from, prev.to, test, step),
    query<{ h: number; n: string }>(
      `select extract(hour from o.created_at at time zone '${TZ}')::int h, count(*) n from orders o where ${sel} group by 1`, p),
    query<{ name: string; qty: string; revenue: string }>(
      `select i.name, sum(i.quantity) qty, sum(i.quantity * i.unit_price) revenue
       from order_items i join orders o on o.id = i.order_id where o.status = 'done' and ${sel}
       group by i.name order by revenue desc, qty desc limit 8`, p),
    query<{ label: string; qty: string; revenue: string }>(
      `select coalesce(c.label, 'Outros') label, sum(i.quantity) qty, sum(i.quantity * i.unit_price) revenue
       from order_items i join orders o on o.id = i.order_id
       left join menu_items m on m.id = i.menu_item_id left join menu_categories c on c.id = m.category_id
       where o.status = 'done' and ${sel} group by 1 order by revenue desc`, p),
    query<{ label: string; orders: string; revenue: string }>(
      `select t.label, count(*) orders, coalesce(sum(o.total) filter (where o.status = 'done'), 0) revenue
       from orders o join dining_tables t on t.id = o.table_id where ${sel}
       group by t.id, t.label, t.number order by revenue desc, orders desc, t.number limit 12`, p),
  ]);

  const byHour = new Map(hours.rows.map((h) => [h.h, Number(h.n)]));
  return {
    range: { key: range.key, label: range.label, from: from.toISOString(), to: to.toISOString(), days: range.days, includeTest: test, bucket },
    current, previous, series: cur, previousSeries: prv,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: byHour.get(hour) ?? 0 })),
    products: products.rows.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) })),
    categories: categories.rows.map((r) => ({ label: r.label, qty: Number(r.qty), revenue: Number(r.revenue) })),
    tables: tables.rows.map((r) => ({ label: r.label, orders: Number(r.orders), revenue: Number(r.revenue) })),
    generatedAt: new Date().toISOString(),
  };
}

// ---------- relatórios / CSV ----------
export type ReportRow = Record<string, string | number>;

export async function reportDays(range: Range): Promise<ReportRow[]> {
  // vendas = total dos pedidos concluídos (mesma fonte do painel); unidades vêm dos itens
  const r = await query<{ d: string; orders: string; done: string; revenue: string; units: string }>(
    `with od as (
       select to_char(o.created_at at time zone '${TZ}', 'YYYY-MM-DD') d, count(*) orders,
              count(*) filter (where o.status = 'done') done,
              coalesce(sum(o.total) filter (where o.status = 'done'), 0) revenue
       from orders o where ${sel} group by 1),
     it as (
       select to_char(o.created_at at time zone '${TZ}', 'YYYY-MM-DD') d, coalesce(sum(i.quantity), 0) units
       from order_items i join orders o on o.id = i.order_id where o.status = 'done' and ${sel} group by 1)
     select od.d, od.orders, od.done, od.revenue, coalesce(it.units, 0) units
     from od left join it on it.d = od.d order by od.d`,
    [range.from, range.to, range.includeTest]);
  return r.rows.map((x) => {
    const done = Number(x.done), revenue = Number(x.revenue);
    return { Data: x.d, Pedidos: Number(x.orders), Concluídos: done, "Vendas (FCFA)": revenue, "Ticket médio (FCFA)": done ? Math.round(revenue / done) : 0, Unidades: Number(x.units) };
  });
}

export async function reportProducts(range: Range): Promise<ReportRow[]> {
  const r = await query<{ name: string; cat: string; qty: string; revenue: string }>(
    `select i.name, coalesce(c.label, 'Outros') cat, sum(i.quantity) qty, sum(i.quantity * i.unit_price) revenue
     from order_items i join orders o on o.id = i.order_id
     left join menu_items m on m.id = i.menu_item_id left join menu_categories c on c.id = m.category_id
     where o.status = 'done' and ${sel} group by i.name, 2 order by revenue desc, qty desc`,
    [range.from, range.to, range.includeTest]);
  return r.rows.map((x) => ({ Produto: x.name, Categoria: x.cat, Unidades: Number(x.qty), "Vendas (FCFA)": Number(x.revenue) }));
}

export async function reportTables(range: Range): Promise<ReportRow[]> {
  const r = await query<{ label: string; orders: string; done: string; revenue: string }>(
    `select t.label, count(*) orders, count(*) filter (where o.status = 'done') done,
            coalesce(sum(o.total) filter (where o.status = 'done'), 0) revenue
     from orders o join dining_tables t on t.id = o.table_id where ${sel} group by t.id, t.label, t.number order by t.number`,
    [range.from, range.to, range.includeTest]);
  return r.rows.map((x) => ({ Mesa: x.label, Pedidos: Number(x.orders), Concluídos: Number(x.done), "Vendas (FCFA)": Number(x.revenue) }));
}

export async function reportOrders(range: Range): Promise<ReportRow[]> {
  const r = await query<{ number: number; origin: "central" | "local"; at: string; mesa: string; status: string; total: number; test: boolean; items: string }>(
    `select o.number, o.origin, to_char(o.created_at at time zone '${TZ}', 'YYYY-MM-DD HH24:MI') "at", t.label mesa, o.status, o.total, o.is_test test,
            (select string_agg(i.quantity || 'x ' || i.name || coalesce(' (' || i.note || ')', ''), '; ' order by i.id) from order_items i where i.order_id = o.id) items
     from orders o join dining_tables t on t.id = o.table_id where ${sel} order by o.created_at`,
    [range.from, range.to, range.includeTest]);
  const label = { pending: "Pendente", preparing: "Em preparação", done: "Concluído" } as const;
  return r.rows.map((x) => ({ Pedido: formatOrderNumber(x.number, x.origin), "Data/hora": x.at, Mesa: x.mesa, Estado: label[x.status as keyof typeof label], "Total (FCFA)": x.total, Teste: x.test ? "sim" : "não", Itens: x.items ?? "" }));
}

/** Vendas por categoria, a partir do relatório de produtos (mesma fonte, mesmos números). */
export function reportCategories(products: ReportRow[]): ReportRow[] {
  const m = new Map<string, { Unidades: number; "Vendas (FCFA)": number }>();
  for (const p of products) {
    const k = String(p.Categoria);
    const c = m.get(k) ?? { Unidades: 0, "Vendas (FCFA)": 0 };
    c.Unidades += Number(p.Unidades); c["Vendas (FCFA)"] += Number(p["Vendas (FCFA)"]);
    m.set(k, c);
  }
  return [...m.entries()].map(([Categoria, v]) => ({ Categoria, ...v })).sort((a, b) => b["Vendas (FCFA)"] - a["Vendas (FCFA)"]);
}
