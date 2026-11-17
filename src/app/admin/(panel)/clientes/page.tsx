import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/db/init";
import { ReportTable } from "@/components/admin/ReportTable";

export const metadata: Metadata = { title: "Clientes" };

/** Clientes com conta (dados pessoais: só Admin e Gerente). */
export default async function Page() {
  await requireManager();
  await ensureMigrated();
  const r = await query<{ name: string; email: string; phone: string; created_at: Date; orders: number; spent: number; unpaid: number }>(
    `select c.name, c.email, c.phone, c.created_at,
            (select count(*)::int from orders o where o.customer_id = c.id) orders,
            (select coalesce(sum(o.total),0)::int from orders o join payments p on p.id = o.payment_id where o.customer_id = c.id and p.status = 'confirmed') spent,
            (select coalesce(sum(o.total),0)::int from orders o where o.customer_id = c.id and o.payment_id is null and not o.is_test) unpaid
     from customers c where c.active order by c.created_at desc limit 1000`);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl text-white">Clientes</h1>
        <p className="text-sm text-mist">Clientes que criaram conta ({r.rows.length}). Dados pessoais: usar só para o serviço do restaurante.</p>
      </div>
      <ReportTable id="clientes" sum={["Pedidos", "Pago (FCFA)", "Por pagar (FCFA)"]} empty="Ainda nenhum cliente criou conta."
        rows={r.rows.map((c) => ({
          Nome: c.name, Email: c.email, Telefone: c.phone,
          Desde: c.created_at.toLocaleDateString("pt-PT", { timeZone: "Africa/Bissau" }),
          Pedidos: c.orders, "Pago (FCFA)": c.spent, "Por pagar (FCFA)": c.unpaid,
        }))} />
    </div>
  );
}
