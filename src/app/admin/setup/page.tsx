import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell, NotConfigured } from "@/components/admin/AuthShell";
import { SetupForm } from "@/components/admin/AuthForms";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { dbConfigured } from "@/lib/db";
import { hasAdmin } from "@/db/init";

export const metadata: Metadata = { title: "Primeiro acesso", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader /></div>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  if (!dbConfigured()) return <NotConfigured />;
  if (await hasAdmin()) redirect("/admin/login");
  return (
    <AuthShell title="Primeiro acesso" intro="Cria a base de dados, as 10 mesas e a conta do gerente. Só funciona uma vez.">
      <SetupForm />
    </AuthShell>
  );
}
