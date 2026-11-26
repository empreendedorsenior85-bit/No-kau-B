import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { AuthShell, NotConfigured } from "@/components/admin/AuthShell";
import { LoginForm } from "@/components/admin/AuthForms";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { getManager } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { hasAdmin } from "@/db/init";
import { isLocalServer } from "@/lib/node-role";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader /></div>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  await connection(); // DATABASE_URL lida em execução (uma build sem a variável não fica presa no aviso)
  if (!dbConfigured()) return <NotConfigured />;
  if (isLocalServer() && !(await hasAdmin())) {
    return (
      <AuthShell title="Servidor local" intro="A aguardar a primeira sincronização com o servidor central.">
        <p className="text-sm leading-relaxed text-mist">
          Os utilizadores, o menu e as mesas vêm do site central. Ligue este computador à internet uma vez; depois
          entre com o mesmo email e palavra-passe do painel central. A página atualiza-se ao recarregar.
        </p>
      </AuthShell>
    );
  }
  if (!(await hasAdmin())) redirect("/admin/setup");
  if (await getManager()) redirect("/admin/dashboard");
  return (
    <AuthShell title="Painel do restaurante" intro="Acesso reservado à equipa do restaurante: administração, gerência e garçons.">
      <LoginForm />
    </AuthShell>
  );
}
