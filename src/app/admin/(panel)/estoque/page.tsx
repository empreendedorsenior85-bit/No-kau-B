import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { isLocalServer } from "@/lib/node-role";
import { listMovements, listStock, untrackedItems, MOVEMENT_LABEL, type StockMovementKind } from "@/lib/stock";
import { StockManager } from "@/components/admin/StockManager";

export const metadata: Metadata = { title: "Estoque" };

const KINDS = Object.keys(MOVEMENT_LABEL) as StockMovementKind[];
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

/**
 * Gestão de stock por produto do menu: quantidades em tempo real, entradas, saídas, contagens, stock mínimo,
 * alertas e esgotado automático. As vendas descontam sozinhas quando o pedido é marcado Concluído.
 */
export default async function Page({ searchParams }: PageProps<"/admin/estoque">) {
  await requireManager();
  const sp = await searchParams;
  const itemId = typeof sp.produto === "string" && /^\d+$/.test(sp.produto) ? Number(sp.produto) : null;
  const kind = typeof sp.tipo === "string" && (KINDS as string[]).includes(sp.tipo) ? (sp.tipo as StockMovementKind) : null;
  const [levels, untracked, movements] = await Promise.all([listStock(), untrackedItems(), listMovements({ itemId, kind, limit: 200 })]);
  const local = isLocalServer();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-white">Estoque</h1>
        <p className="max-w-3xl text-sm text-mist">
          Quantidade disponível de cada produto do menu, atualizada em tempo real. Cada pedido marcado <strong className="text-white">Concluído</strong> desconta
          sozinho (1 vendido = 1 a menos); se voltar atrás, o stock é reposto. Abaixo do mínimo aparece o alerta; a zero, o produto fica esgotado no menu e volta quando registar uma entrada.
        </p>
      </div>
      {local && (
        <p role="note" data-testid="local-readonly" className="rounded-2xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm text-gold-300">
          Servidor local do restaurante: o stock gere-se no site central. Os pedidos concluídos aqui são descontados quando chegarem ao central.
        </p>
      )}

      <StockManager initial={levels} untracked={untracked} readOnly={local} />

      <section aria-labelledby="historico" data-testid="stock-history">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="historico" className="font-display text-2xl text-white">Histórico de movimentações</h2>
            <p className="text-sm text-mist">Cada entrada, saída, contagem e venda fica registada e não pode ser alterada nem apagada.</p>
          </div>
          <div className="flex flex-wrap gap-2">
          <a href={`/admin/estoque/csv${itemId || kind ? `?${new URLSearchParams({ ...(itemId ? { produto: String(itemId) } : {}), ...(kind ? { tipo: kind } : {}) })}` : ""}`}
            className="rounded-full border border-gold/60 px-4 py-2 text-sm text-gold-300 hover:bg-gold/10" data-testid="stock-csv">Exportar CSV</a>
          <a href="/admin/estoque/csv?lista=1" className="rounded-full border border-kau-800 px-4 py-2 text-sm text-mist hover:text-white" data-testid="stock-csv-list">Stock atual (CSV)</a>
          </div>
        </div>
        <form className="mt-4 flex flex-wrap gap-2" action="/admin/estoque">
          <select name="produto" defaultValue={itemId ?? ""} aria-label="Produto" className="h-11 min-w-0 max-w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white">
            <option value="">Todos os produtos</option>
            {levels.map((l) => <option key={l.menuItemId} value={l.menuItemId}>{l.name}</option>)}
          </select>
          <select name="tipo" defaultValue={kind ?? ""} aria-label="Tipo de movimento" className="h-11 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white">
            <option value="">Todos os tipos</option>
            {KINDS.map((k) => <option key={k} value={k}>{MOVEMENT_LABEL[k]}</option>)}
          </select>
          <button className="h-11 rounded-full bg-gold px-5 text-sm font-medium text-kau-950">Filtrar</button>
        </form>
        {movements.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-kau-800 p-6 text-center text-sm text-mist">Sem movimentos{itemId || kind ? " com estes filtros" : ""}.</p>
        ) : (
          <ul className="mt-4 divide-y divide-kau-800 rounded-2xl border border-kau-800 bg-kau-900" data-testid="stock-movements">
            {movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm" data-testid="stock-movement" data-kind={m.kind} data-item={m.menuItemId}>
                <span className="min-w-0">
                  <span className="block text-white">{m.name} · <span className="text-mist">{MOVEMENT_LABEL[m.kind]}</span></span>
                  <span className="text-xs text-mist">{fmt(m.createdAt)} · {m.actor}{m.reason ? ` · ${m.reason}` : ""}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={`font-semibold ${m.delta > 0 ? "text-[#7fc290]" : m.delta < 0 ? "text-[#e48a7d]" : "text-mist"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</span>
                  <span className="ml-2 text-xs text-mist">→ fica {m.quantityAfter}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
