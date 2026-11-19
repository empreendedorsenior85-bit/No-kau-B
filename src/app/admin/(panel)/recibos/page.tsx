import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getReceiptSettings } from "@/lib/receipt/store";
import { isLocalServer } from "@/lib/node-role";
import { ReceiptSettingsEditor } from "@/components/admin/ReceiptSettingsEditor";

export const metadata: Metadata = { title: "Personalização de Ingressos" };

/** Personalização dos recibos e talões (só Admin). */
export default async function Page() {
  await requireAdmin();
  const r = await getReceiptSettings();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-white">Personalização de Ingressos</h1>
        <p className="mt-1 text-sm text-mist">Configure a aparência dos seus recibos e pedidos de POS.</p>
      </div>
      <ReceiptSettingsEditor initial={r.settings} logo={{ has: r.hasLogo, version: r.logoVersion }} readOnly={isLocalServer()} updated={{ at: r.updatedAt, by: r.updatedBy }} />
    </div>
  );
}
