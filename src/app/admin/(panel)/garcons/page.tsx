import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/db/init";
import { WaitersManager, type TableRow, type WaiterRow } from "@/components/admin/WaitersManager";
import { LocalReadOnly } from "@/components/admin/LocalReadOnly";

export const metadata: Metadata = { title: "Garçons" };

/** Garçons: contas, mesas atribuídas e atividade de hoje (Admin e Gerente). */
export default async function Page() {
  await requireManager();
  await ensureMigrated();
  const [w, t] = await Promise.all([
    query<WaiterRow>(
      `select u.id, coalesce(u.name, split_part(u.email, '@', 1)) "name", u.email, u.active,
              (select count(*)::int from dining_tables d where d.waiter_id = u.id and d.active) "tables",
              (select count(*)::int from service_calls s where s.created_at >= date_trunc('day', now())
                 and coalesce(s.ack_by, s.done_by) in (coalesce(u.name, u.email), u.email)) "answeredToday"
       from admin_users u where u.role = 'garcom' order by u.active desc, coalesce(u.name, u.email)`),
    query<TableRow>(`select id, label, active, waiter_id "waiterId" from dining_tables order by number`),
  ]);
  return (
    <>
      <h1 className="mb-1 font-display text-3xl text-white">Garçons</h1>
      <p className="mb-6 text-sm text-mist">Contas dos garçons e mesas de que cada um é responsável. O garçom entra em /admin e vê só o atendimento: mesas, chamadas e pedidos.</p>
      <LocalReadOnly what="os garçons e as atribuições de mesas"><WaitersManager waiters={w.rows} tables={t.rows} /></LocalReadOnly>
    </>
  );
}
