import type { Metadata } from "next";
import { TablesView, type TableInfo } from "@/components/admin/TablesView";
import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/db/init";

export const metadata: Metadata = { title: "Mesas" };

/** Painel de mesas (toda a equipa): estado de cada mesa, chamadas dos clientes, garçom e pedidos. */
export default async function Page() {
  const me = await requireStaff();
  await ensureMigrated();
  const r = await query<TableInfo>(
    `select t.id, t.number, t.label, t.active, t.waiter_id "waiterId", coalesce(w.name, split_part(w.email, '@', 1)) "waiterName"
     from dining_tables t left join admin_users w on w.id = t.waiter_id and w.active order by t.number`);
  return (
    <>
      <h1 className="mb-1 font-display text-3xl text-white">Mesas e atendimento</h1>
      <p className="mb-5 text-sm text-mist">
        {me.role === "garcom"
          ? "As chamadas das suas mesas tocam e aparecem primeiro. Toque em “A caminho” quando for atender e em “Resolvido” no fim."
          : "Estado de todas as mesas em tempo real: chamadas dos clientes, pedidos e garçom responsável."}
      </p>
      <TablesView tables={r.rows} />
    </>
  );
}
