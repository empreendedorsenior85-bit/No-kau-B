import type { Metadata } from "next";
import { UsersManager } from "@/components/admin/UsersManager";
import { LocalReadOnly } from "@/components/admin/LocalReadOnly";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata: Metadata = { title: "Utilizadores" };

export default async function Page() {
  const me = await requireAdmin(); // só Admin; o Gerente é reencaminhado
  const r = await query<{ id: string; email: string; role: "admin" | "gerente"; active: boolean; created_at: Date }>(
    "select id, email, role, active, created_at from admin_users order by role, email");
  return (
    <>
      <h1 className="mb-2 font-display text-3xl text-white">Utilizadores</h1>
      <p className="mb-8 max-w-2xl text-sm text-mist">
        <strong className="text-white">Admin</strong>: controlo total (QR Codes e mesas, utilizadores, menu, pedidos).{" "}
        <strong className="text-white">Gerente</strong>: acompanha e atualiza pedidos, consulta mesas e QR Codes e gere o menu.
      </p>
      <LocalReadOnly what="os utilizadores"><UsersManager meId={me.id} users={r.rows.map((u) => ({ id: u.id, email: u.email, role: u.role, active: u.active, createdAt: u.created_at.toISOString() }))} /></LocalReadOnly>
    </>
  );
}
