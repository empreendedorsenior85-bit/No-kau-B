import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { historyRange, reservationHistory } from "@/lib/reservations";
import { ReservationsBoard } from "@/components/admin/ReservationsBoard";
import { ReportTable } from "@/components/admin/ReportTable";
import { RESERVATION_LABEL, type ReservationStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Reservas" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

/** Reservas: decisão em tempo real (pendentes) + histórico com filtros. Só Admin e Gerente. */
export default async function Page({ searchParams }: PageProps<"/admin/reservas">) {
  await requireManager();
  const sp = await searchParams;
  const { today, from, to } = historyRange(isDate(sp.de) ? sp.de : null, isDate(sp.ate) ? sp.ate : null);
  const status = STATUSES.includes(sp.estado as ReservationStatus) ? (sp.estado as ReservationStatus) : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const history = await reservationHistory({ from, to, status, q });
  const field = "h-10 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white";
  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl text-white">Reservas</h1>
        <p className="text-sm text-mist">Pedidos feitos no site. Aprovar ou rejeitar avisa o cliente automaticamente no site (com a mensagem, se escrever uma).</p>
      </div>
      <ReservationsBoard today={today} />
      <section className="space-y-3" aria-labelledby="historico">
        <h2 id="historico" className="font-display text-2xl text-white">Histórico</h2>
        <form className="flex flex-wrap items-end gap-3" data-testid="reservations-filter">
          <label className="text-xs text-mist">De<input type="date" name="de" defaultValue={from} className={`${field} mt-1 block`} /></label>
          <label className="text-xs text-mist">Até<input type="date" name="ate" defaultValue={to} className={`${field} mt-1 block`} /></label>
          <label className="text-xs text-mist">Estado
            <select name="estado" defaultValue={status ?? ""} className={`${field} mt-1 block`}>
              <option value="">Todos</option>
              {STATUSES.map((s) => <option key={s} value={s}>{RESERVATION_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="text-xs text-mist">Procurar<input name="q" defaultValue={q} placeholder="Nome, telefone, email ou código" className={`${field} mt-1 block w-60`} /></label>
          <button className="h-10 rounded-full bg-gold px-5 text-sm font-medium text-kau-950">Filtrar</button>
        </form>
        <p className="text-xs text-mist">{history.length} reserva(s) de {from.split("-").reverse().join("/")} a {to.split("-").reverse().join("/")}{history.length === 1000 ? " (máximo de 1000 — afine os filtros)" : ""}.</p>
        <ReportTable id="reservas-historico" empty="Sem reservas com estes filtros." sum={["Pessoas"]}
          rows={history.map((r) => ({
            Data: r.date.split("-").reverse().join("/"), Hora: r.time, Código: r.code, Nome: r.name, Telefone: r.phone, Email: r.email ?? "",
            Pessoas: r.guests, Estado: RESERVATION_LABEL[r.status], "Decidido por": r.decidedBy ?? "—", Mensagem: r.decisionNote ?? "", Observações: r.notes ?? "",
          }))} />
      </section>
    </div>
  );
}
