import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ClientShell, safeVolta } from "@/components/client/ClientShell";
import { RegisterForm } from "@/components/client/ClientForms";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { getCustomer } from "@/lib/customers";

export const metadata: Metadata = { title: "Criar conta", robots: { index: false, follow: false } };

export default function Page({ searchParams }: PageProps<"/cliente/registo">) {
  return <Suspense fallback={<div className="grid min-h-svh place-items-center bg-kau-950"><BrandLoader /></div>}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: PageProps<"/cliente/registo">["searchParams"] }) {
  const volta = safeVolta((await searchParams).volta);
  if (await getCustomer()) redirect(volta);
  return (
    <ClientShell title="Criar conta" intro="Uma conta para todas as visitas: os seus pedidos ficam guardados, em qualquer mesa." back={volta.startsWith("/m/") ? { href: volta, label: "Voltar ao menu" } : undefined}>
      <RegisterForm volta={volta} />
      <p className="mt-6 text-center text-sm text-mist">Já tem conta? <Link href={`/cliente/entrar${volta !== "/cliente" ? `?volta=${encodeURIComponent(volta)}` : ""}`} className="text-gold-300 underline underline-offset-4">Entrar</Link></p>
    </ClientShell>
  );
}
