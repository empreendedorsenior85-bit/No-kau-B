import { getManager } from "@/lib/auth";
import { isManagerRole } from "@/lib/auth-types";
import { toCsv } from "@/lib/csv";
import { listMovements, listStock, MOVEMENT_LABEL, type StockMovementKind } from "@/lib/stock";

const KINDS = Object.keys(MOVEMENT_LABEL);
const STATUS = { out: "Esgotado", low: "A acabar", ok: "OK" } as const;
const bissau = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("pt-PT", { ...o, timeZone: "Africa/Bissau" });

/** CSV (Excel PT) do stock: ?tipo=… e/ou ?produto=… → histórico de movimentos; ?lista=1 → stock atual. Só Admin e Gerente. */
export async function GET(req: Request) {
  const m = await getManager();
  if (!m) return new Response("unauthorized", { status: 401 });
  if (!isManagerRole(m.role)) return new Response("forbidden", { status: 403 });
  const url = new URL(req.url);
  const day = new Date().toISOString().slice(0, 10);
  const headers = (name: string) => ({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });

  if (url.searchParams.get("lista") === "1") {
    const rows = (await listStock()).map((l) => ({
      Produto: l.name, Categoria: l.category, Quantidade: l.quantity, "Stock mínimo": l.minQuantity, Estado: STATUS[l.status],
      "No menu": l.available ? "Disponível" : l.soldoutByStock ? "Esgotado (automático)" : "Indisponível",
      "Esgotado automático": l.autoSoldout ? "sim" : "não", "Atualizado": bissau(l.updatedAt, { dateStyle: "short", timeStyle: "short" }),
    }));
    return new Response(toCsv(rows, ["Produto", "Categoria", "Quantidade", "Stock mínimo", "Estado", "No menu", "Esgotado automático", "Atualizado"]), { headers: headers(`nokau-stock-${day}.csv`) });
  }
  const p = url.searchParams.get("produto"), t = url.searchParams.get("tipo");
  const rows = (await listMovements({
    itemId: p && /^\d+$/.test(p) ? Number(p) : null, kind: t && KINDS.includes(t) ? (t as StockMovementKind) : null, limit: 2000,
  })).map((x) => ({
    Data: bissau(x.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" }), Hora: bissau(x.createdAt, { hour: "2-digit", minute: "2-digit" }),
    Produto: x.name, Tipo: MOVEMENT_LABEL[x.kind], Quantidade: x.delta, "Fica com": x.quantityAfter, Motivo: x.reason ?? "", Por: x.actor,
  }));
  return new Response(toCsv(rows, ["Data", "Hora", "Produto", "Tipo", "Quantidade", "Fica com", "Motivo", "Por"]), { headers: headers(`nokau-movimentos-stock-${day}.csv`) });
}
