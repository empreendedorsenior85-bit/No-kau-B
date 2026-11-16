import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

export function AuthShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-kau-950 px-5 py-10">
      <div className="w-full max-w-md rounded-[1.75rem] border border-kau-800 bg-kau-900 p-8">
        <Logo size={72} className="mx-auto h-[72px] w-[72px]" />
        <h1 className="mt-6 text-center font-display text-3xl text-white">{title}</h1>
        {intro && <p className="mt-2 text-center text-sm text-mist">{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

export function NotConfigured() {
  return (
    <AuthShell title="Base de dados não configurada">
      <p className="text-sm leading-relaxed text-mist">
        Falta a variável <code className="text-gold-300">DATABASE_URL</code> no servidor. Configure a base de dados (PostgreSQL) e volte a abrir esta página.
      </p>
    </AuthShell>
  );
}
