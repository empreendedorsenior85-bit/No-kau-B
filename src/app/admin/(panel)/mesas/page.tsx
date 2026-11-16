import type { Metadata } from "next";
import { TablesView } from "@/components/admin/TablesView";
import { requireManager } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata: Metadata = { title: "Mesas" };

export default async function Page() {
  await requireManager();
  const r = await query<{ id: number; number: number; label: string; active: boolean }>(
    "select id, number, label, active from dining_tables order by number");
  return (
    <>
      <h1 className="mb-5 font-display text-3xl text-white">Pedidos por mesa</h1>
      <TablesView tables={r.rows} />
    </>
  );
}
