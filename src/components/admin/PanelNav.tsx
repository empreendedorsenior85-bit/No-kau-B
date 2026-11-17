"use client";
import { LocalOfflineBanner, SyncStatus } from "./SyncStatus";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/admin/actions";
import { Logo } from "@/components/brand/Logo";
import { useLive, type Conn } from "./LiveOrders";
import { NotificationBell } from "./NotificationBell";
import { ROLE_LABEL, type Role } from "@/lib/auth-types";

/** `who`: quem vê o item — "admin" (só Admin), "manager" (Admin e Gerente) ou "staff" (toda a equipa, incluindo Garçom). */
type Item = { href: string; label: string; icon: ReactNode; who: "admin" | "manager" | "staff" };
const ic = (d: string) => (<svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>);
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Operação", items: [
    { href: "/admin/dashboard", label: "Visão geral", who: "manager", icon: ic("M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10") },
    { href: "/admin/pedidos", label: "Pedidos", who: "staff", icon: ic("M6 2h12l2 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7l2-5zM4 7h16M9 11h6") },
    { href: "/admin/mesas", label: "Mesas", who: "staff", icon: ic("M4 9h16M6 9v10M18 9v10M3 9l1-4h16l1 4") },
    { href: "/admin/atendimento", label: "Atendimento", who: "manager", icon: ic("M12 8v4l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z") },
  ] },
  { title: "Gestão", items: [
    { href: "/admin/menu", label: "Menu", who: "manager", icon: ic("M4 4h16v4H4zM4 12h16M4 16h16M4 20h10") },
    { href: "/admin/relatorios", label: "Relatórios", who: "manager", icon: ic("M4 20V10M10 20V4M16 20v-8M22 20H2") },
    { href: "/admin/qr", label: "QR Codes", who: "manager", icon: ic("M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M14 20h3M20 20v1") },
  ] },
  { title: "Equipa", items: [
    { href: "/admin/garcons", label: "Garçons", who: "manager", icon: ic("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 12 0v1M18 8v6M15 11h6") },
    { href: "/admin/utilizadores", label: "Utilizadores", who: "admin", icon: ic("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8") },
    { href: "/admin/atividade", label: "Atividade", who: "admin", icon: ic("M22 12h-4l-3 9L9 3l-3 9H2") },
    { href: "/admin/conta", label: "A minha conta", who: "staff", icon: ic("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z") },
  ] },
];

const CONN: Record<Conn, { label: string; dot: string }> = {
  live: { label: "Ao vivo", dot: "bg-[#7fc290]" },
  connecting: { label: "A ligar…", dot: "bg-[#e0a64a]" },
  reconnecting: { label: "A reconectar…", dot: "bg-[#e0a64a] animate-pulse" },
  offline: { label: "Sem rede", dot: "bg-[#e48a7d] animate-pulse" },
};

/** Estrutura do painel: menu lateral (computador), separadores deslizantes (telemóvel), barra superior e conteúdo. */
export function PanelFrame({ email, role, children }: { email: string; role: Role; children: ReactNode }) {
  const path = usePathname();
  const { conn, unseen, alertsOn, enableAlerts } = useLive();
  const c = CONN[conn];
  const sees = (i: Item) => i.who === "staff" || (i.who === "manager" && role !== "garcom") || role === "admin";
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter(sees) })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);
  const active = (h: string) => path === h || path.startsWith(h + "/");
  const badge = (href: string) => href === "/admin/pedidos" && unseen.size > 0 && (
    <span className="ml-auto inline-grid h-5 min-w-5 place-items-center rounded-full bg-[#e0a64a] px-1.5 text-xs font-bold text-kau-950">{unseen.size}</span>
  );

  return (
    <div className="min-h-svh bg-kau-950 lg:pl-64 print:pl-0">
      {/* menu lateral */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-kau-800 bg-kau-900/60 p-4 lg:flex print:hidden">
        <Link href={role === "garcom" ? "/admin/mesas" : "/admin/dashboard"} className="flex items-center gap-3 px-2 py-2" aria-label="Painel Nô Kau">
          <Logo size={40} className="h-10 w-10" />
          <span><span className="block font-display text-lg leading-tight text-white">Nô Kau</span><span className="text-xs text-mist">Painel de gestão</span></span>
        </Link>
        <nav aria-label="Painel" className="mt-6 flex-1 space-y-6 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-3 pb-2 text-[0.68rem] uppercase tracking-[0.18em] text-mist">{g.title}</p>
              <ul className="space-y-1">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={active(i.href) ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${active(i.href) ? "bg-gold text-kau-950" : "text-mist hover:bg-kau-900 hover:text-white"}`}>
                      {i.icon}{i.label}{badge(i.href)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-4 rounded-xl border border-kau-800 p-3 text-sm">
          <p className="truncate text-white" title={email}>{email}</p>
          <p className="mt-0.5 text-xs text-gold-300">{ROLE_LABEL[role]}</p>
          <form action={logoutAction} className="mt-2"><button className="text-xs text-mist underline underline-offset-4 hover:text-white">Terminar sessão</button></form>
        </div>
      </aside>

      {/* barra superior */}
      <header className="sticky top-0 z-30 border-b border-kau-800 bg-kau-950/95 backdrop-blur print:hidden">
        <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
          <Link href={role === "garcom" ? "/admin/mesas" : "/admin/dashboard"} className="flex items-center gap-2 lg:hidden" aria-label="Painel Nô Kau">
            <Logo size={32} className="h-8 w-8" /><span className="font-display text-lg text-white">Painel</span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-xs text-mist">
            <span className="flex items-center gap-2" role="status" aria-live="polite"><span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} aria-hidden />{c.label}</span>
            <SyncStatus />
            {!alertsOn ? (
              <button onClick={enableAlerts} className="rounded-full border border-gold/60 px-3 py-1.5 text-gold-300 hover:bg-gold/10">🔔 Ativar alertas</button>
            ) : <span className="rounded-full bg-ok/15 px-3 py-1.5 text-[#7fc290]">🔔 Alertas ativos</span>}
            <NotificationBell />
            <Link href="/admin/conta" className="hidden items-center gap-2 hover:text-white sm:flex lg:hidden" title="A minha conta">
              <span className="max-w-[10rem] truncate">{email}</span>
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-gold-300 ring-1 ring-gold/50">{ROLE_LABEL[role]}</span>
            </Link>
            <form action={logoutAction} className="lg:hidden"><button className="hover:text-white">Sair</button></form>
          </div>
        </div>
        <nav aria-label="Painel (telemóvel)" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden [scrollbar-width:none]">
          {flat.map((i) => (
            <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm ${active(i.href) ? "bg-gold text-kau-950" : "text-mist hover:text-white"}`}>
              {i.label}{badge(i.href) && <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-[#e0a64a] px-1.5 text-xs font-bold text-kau-950">{unseen.size}</span>}
            </Link>
          ))}
        </nav>
        <LocalOfflineBanner />
        {conn !== "live" && conn !== "connecting" && (
          <p role="alert" className="bg-[#e0a64a]/15 px-4 py-2 text-center text-sm text-[#e0a64a]">
            {conn === "offline"
              ? "Sem ligação à internet. Os pedidos novos podem não aparecer até a rede voltar — vão ser recuperados automaticamente."
              : "A reconectar ao servidor… os pedidos em falta serão recuperados."}
          </p>
        )}
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</div>
    </div>
  );
}
