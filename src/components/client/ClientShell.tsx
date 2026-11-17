import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

/** Moldura das páginas do cliente (mesmo visual do menu da mesa). */
export function ClientShell({ title, intro, back, children }: { title: string; intro?: string; back?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="nums-lining min-h-svh bg-kau-950">
      <header className="border-b border-kau-800">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3"><Logo size={40} className="h-10 w-10" /><span className="font-display text-lg text-white">Nô Kau</span></Link>
          {back && <Link href={back.href} className="text-sm text-gold-300 underline underline-offset-4">{back.label}</Link>}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-display text-3xl text-white">{title}</h1>
        {intro && <p className="mt-2 text-sm leading-relaxed text-mist">{intro}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

/** Regresso seguro (só para o menu de uma mesa ou para a área do cliente). */
export const safeVolta = (v: unknown) =>
  typeof v === "string" && (/^\/m\/[A-Za-z0-9_-]{22}$/.test(v) || /^\/cliente\/recibos\/[0-9a-f-]{36}$/.test(v)) ? v : "/cliente";
