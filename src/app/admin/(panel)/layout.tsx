import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LiveOrdersProvider } from "@/components/admin/LiveOrders";
import { PanelFrame } from "@/components/admin/PanelNav";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { requireManager } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Painel Nô Kau" }, robots: { index: false, follow: false } };

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader label="A abrir o painel…" /></div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  if (!dbConfigured()) redirect("/admin/login");
  const m = await requireManager(); // verificação no servidor em cada pedido
  return (
    <LiveOrdersProvider>
      <div className="nums-lining">
        <PanelFrame email={m.email} role={m.role}>{children}</PanelFrame>
      </div>
    </LiveOrdersProvider>
  );
}
