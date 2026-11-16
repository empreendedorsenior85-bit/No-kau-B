import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell, NotConfigured } from "@/components/admin/AuthShell";
import { LoginForm } from "@/components/admin/AuthForms";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { getManager } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { hasAdmin } from "@/db/init";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader /></div>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  if (!dbConfigured()) return <NotConfigured />;
  if (!(await hasAdmin())) redirect("/admin/setup");
  if (await getManager()) redirect("/admin/dashboard");
  return (
    <AuthShell title="Painel do restaurante" intro="Acesso reservado ao gerente.">
      <LoginForm />
    </AuthShell>
  );
}
