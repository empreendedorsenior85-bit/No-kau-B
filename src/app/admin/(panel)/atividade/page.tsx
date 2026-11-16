import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Atividade" };

type Row = { id: string; at: Date; actor: string | null; action: string; entity: string; entity_id: string | null; detail: Record<string, unknown> | null };

const when = (d: Date) => d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Bissau" });
const st = (s: unknown) => STATUS_LABEL[s as OrderStatus] ?? String(s);

function describe(r: Row): string {
  const d = r.detail ?? {};
  switch (r.action) {
    case "login": return "Iniciou sessão";
    case "setup": return "Configurou o sistema (primeiro acesso)";
    case "order.create": return `Novo pedido de cliente${d.total ? ` · ${d.total} FCFA` : ""}${d.isTest ? " (teste)" : ""}`;
    case "order.status": return `Pedido atualizado: ${st(d.from)} → ${st(d.to)}`;
    case "menu.create": return `Produto criado${d.price !== undefined ? ` (${d.price} FCFA)` : ""}`;
    case "menu.update": return `Produto editado${d.price !== undefined ? ` (${d.price} FCFA)` : ""}`;
    case "menu.flags": return `Produto: ${Object.entries(d).map(([k, v]) => `${k === "available" ? "disponível" : "visível"} = ${v ? "sim" : "não"}`).join(", ")}`;
    case "menu.image_remove": return "Fotografia de produto removida";
    case "menu.import_catalog": return `Ementa original importada${d.created !== undefined ? `: ${d.created} novos, ${d.kept} já existiam` : ""}`;
    case "menu.seed_demo": return "Produtos de demonstração carregados";
    case "category.create": return `Categoria criada${d.label ? `: ${d.label}` : ""}`;
    case "category.update": return `Categoria editada${d.label ? `: ${d.label}` : ""}`;
    case "category.move": return "Categoria reordenada";
    case "category.active": return `Categoria ${d.active ? "ativada" : "desativada"}`;
    case "category.delete": return "Categoria eliminada";
    case "table.add": return "Mesa adicionada";
    case "table.rename": return `Mesa renomeada${d.label ? `: ${d.label}` : ""}`;
    case "table.activate": return "Mesa ativada";
    case "table.deactivate": return "Mesa desativada";
    case "table.rotate_token": return "Novo QR Code gerado";
    case "user.create": return `Utilizador criado${d.email ? `: ${d.email}` : ""}`;
    case "user.role": return `Perfil alterado para ${d.role === "admin" ? "Admin" : "Gerente"}`;
    case "user.activate": return "Conta ativada";
    case "user.deactivate": return "Conta desativada";
    case "user.password_reset": return "Palavra-passe redefinida por um Admin";
    case "user.password_change": return "Alterou a própria palavra-passe";
    default: return r.action;
  }
}

export default async function Page() {
  await requireAdmin();
  const r = await query<Row>("select id::text, at, actor, action, entity, entity_id, detail from audit_log order by id desc limit 150");
  return (
    <>
      <h1 className="mb-2 font-display text-3xl text-white">Atividade</h1>
      <p className="mb-6 max-w-2xl text-sm text-mist">Registo das últimas 150 ações no sistema: quem fez o quê e quando. Só visível para Admin.</p>
      <div className="overflow-x-auto rounded-xl border border-kau-800" data-testid="activity">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-kau-900 text-mist"><tr><th className="p-3 font-medium">Quando</th><th className="p-3 font-medium">Quem</th><th className="p-3 font-medium">Ação</th></tr></thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.id} className="border-t border-kau-800">
                <td className="whitespace-nowrap p-3 tabular-nums text-mist">{when(x.at)}</td>
                <td className="p-3 text-white">{x.actor ?? "—"}</td>
                <td className="p-3 text-white">{describe(x)}</td>
              </tr>
            ))}
            {r.rows.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-mist">Sem atividade registada.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
