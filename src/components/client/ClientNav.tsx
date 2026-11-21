"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { MenuButton, SideDrawer } from "@/components/nav/SideDrawer";
import { clientLogoutAction } from "@/app/cliente/actions";

const ic = (d: string) => (<svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>);
type Item = { href: string; label: string; icon: ReactNode; id: string };
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "A minha conta", items: [
    { href: "/cliente", id: "resumo", label: "Resumo", icon: ic("M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10") },
    { href: "/cliente#minhas-reservas", id: "reservas", label: "As minhas reservas", icon: ic("M3 5h18v16H3zM3 9h18M8 3v4M16 3v4M8 14h3") },
    { href: "/cliente#meus-pagamentos", id: "pagamentos", label: "Pagamentos e recibos", icon: ic("M2 7h20v12H2zM2 11h20M6 15h4") },
    { href: "/cliente#meus-pedidos", id: "pedidos", label: "Os meus pedidos", icon: ic("M6 2h12l2 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7l2-5zM4 7h16M9 11h6") },
  ] },
  { title: "Nô Kau", items: [
    { href: "/reservas", id: "reservar", label: "Reservar mesa", icon: ic("M12 5v14M5 12h14") },
    { href: "/menu", id: "menu", label: "Ver o menu", icon: ic("M4 4h16v4H4zM4 12h16M4 16h16M4 20h10") },
    { href: "/", id: "site", label: "Página inicial", icon: ic("M3 10l9-7 9 7v11H3z") },
  ] },
];

function Content({ name, email, onNavigate }: { name: string; email: string; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <>
      <Link href="/" onClick={onNavigate} className="mr-12 flex shrink-0 items-center gap-3 self-start px-2 py-2" aria-label="Nô Kau — página inicial">
        <Logo size={40} className="h-10 w-10" />
        <span><span className="block font-display text-lg leading-tight text-white">Nô Kau</span><span className="text-xs text-mist">Área do cliente</span></span>
      </Link>
      <nav aria-label="Área do cliente" className="-mx-1 mt-5 flex-1 space-y-6 overflow-y-auto overscroll-contain px-1">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-2 text-[0.68rem] uppercase tracking-[0.18em] text-mist">{g.title}</p>
            <ul className="space-y-1">
              {g.items.map((i) => {
                const on = i.href === "/cliente" && path === "/cliente";
                return (
                  <li key={i.href}>
                    <Link href={i.href} onClick={onNavigate} aria-current={on ? "page" : undefined} data-testid={`cnav-${i.id}`}
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${on ? "bg-gold text-kau-950" : "text-mist hover:bg-kau-900 hover:text-white"}`}>
                      {i.icon}<span className="min-w-0 flex-1 truncate">{i.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-4 shrink-0 rounded-xl border border-kau-800 p-3 text-sm">
        <p className="truncate text-white" title={name}>{name}</p>
        <p className="truncate text-xs text-mist" title={email}>{email}</p>
        <form action={clientLogoutAction} className="mt-2">
          <input type="hidden" name="volta" value="/cliente" />
          <button className="min-h-9 text-xs text-mist underline underline-offset-4 hover:text-white" data-testid="cnav-logout">Terminar sessão</button>
        </form>
      </div>
    </>
  );
}

/** Navegação da área do cliente: barra lateral fixa no computador, menu lateral ☰ no telemóvel e tablet. */
export function ClientNav({ name, email }: { name: string; email: string }) {
  const path = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const close = useCallback(() => setOpenAt(null), []);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-kau-800 bg-kau-900/60 p-4 lg:flex print:hidden" data-testid="client-sidebar">
        <Content name={name} email={email} />
      </aside>
      <SideDrawer id="cliente-menu" open={open} onClose={close} label="Menu da área do cliente" className="p-4 lg:hidden">
        <Content name={name} email={email} onNavigate={close} />
      </SideDrawer>
      <header className="sticky top-0 z-30 border-b border-kau-800 bg-kau-950/95 backdrop-blur lg:hidden print:hidden">
        <div className="flex h-14 items-center gap-2 px-2">
          <MenuButton open={open} onClick={() => setOpenAt(open ? null : path)} controls="cliente-menu" />
          <Link href="/" className="flex min-w-0 items-center gap-2"><Logo size={32} className="h-8 w-8 shrink-0" /><span className="truncate font-display text-lg text-white">Nô Kau</span></Link>
          <span className="ml-auto truncate pr-2 text-xs text-mist">Área do cliente</span>
        </div>
      </header>
    </>
  );
}
