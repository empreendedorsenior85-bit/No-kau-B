import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ClientShell, safeVolta } from "@/components/client/ClientShell";
import { ClientLoginForm } from "@/components/client/ClientForms";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { getCustomer } from "@/lib/customers";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default function Page({ searchParams }: PageProps<"/cliente/entrar">) {
  return <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader /></div>}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: PageProps<"/cliente/entrar">["searchParams"] }) {
  const volta = safeVolta((await searchParams).volta);
  if (await getCustomer()) redirect(volta);
  return (
    <ClientShell title="Entrar" intro="Entre para ver o histórico dos seus pedidos e se já estão pagos." back={volta !== "/cliente" ? { href: volta, label: "Voltar ao menu" } : undefined}>
      <ClientLoginForm volta={volta} />
      <p className="mt-6 text-center text-sm text-mist">Ainda não tem conta? <Link href={`/cliente/registo${volta !== "/cliente" ? `?volta=${encodeURIComponent(volta)}` : ""}`} className="text-gold-300 underline underline-offset-4">Criar conta</Link></p>
    </ClientShell>
  );
}
