import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

/** Moldura das páginas do cliente (mesmo visual do menu da mesa). */
export function ClientShell({ title, intro, back, account, children }: {
  title: string; intro?: string; back?: { href: string; label: string };
  /** Cliente com sessão iniciada → barra lateral (computador) / menu lateral ☰ (telemóvel e tablet). */
  account?: { name: string; email: string }; children: ReactNode;
}) {
  // área da conta: o menu e a moldura vêm do layout partilhado (app/cliente/(conta)/layout.tsx)
  if (account) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 print:max-w-none print:p-0">
        <h1 className="font-display text-3xl text-white print:hidden">{title}</h1>
        {intro && <p className="mt-2 text-sm leading-relaxed text-mist print:hidden">{intro}</p>}
        <div className="mt-6 print:mt-0">{children}</div>
      </main>
    );
  }
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

export { safeVolta } from "@/lib/client-return";
