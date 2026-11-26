"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { nav } from "@/lib/site";
import { SideDrawer } from "@/components/nav/SideDrawer";
import { useClientValue } from "@/lib/use-client-value";
import { hasClientHint } from "@/lib/client-hint";

export function Header() {
  const pathname = usePathname();
  // com sessão de cliente: "A minha conta" (vai direto à área do cliente) em vez de "Entrar"
  const account = useClientValue(hasClientHint) === 1;
  const loginHref = account ? "/cliente" : "/entrar";
  const loginLabel = account ? "A minha conta" : "Entrar";
  const [scrolled, setScrolled] = useState(false);
  // O menu fica associado à rota em que foi aberto: ao navegar, fecha automaticamente.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (v: boolean | ((p: boolean) => boolean)) =>
    setOpenPath((cur) => {
      const next = typeof v === "function" ? v(cur === pathname) : v;
      return next ? pathname : null;
    });
  const close = useCallback(() => setOpenPath(null), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color] duration-500 ${
        scrolled || open
          ? "border-b border-kau-800/80 bg-kau-950/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:h-20 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Nô Kau — página inicial">
          <Logo size={48} priority className="h-10 w-10 sm:h-12 sm:w-12" />
          <span className="font-display text-lg text-white sm:text-xl">Nô Kau</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-8 lg:flex">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative text-sm tracking-wide transition-colors hover:text-gold-300 ${
                  active ? "text-gold-300" : "text-white/85"
                } after:absolute after:-bottom-1.5 after:left-0 after:h-px after:bg-gold-300 after:transition-[width] after:duration-500 ${
                  active ? "after:w-full" : "after:w-0 hover:after:w-full"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href={loginHref} data-testid="header-login"
            className={`rounded-full border border-gold/60 px-5 py-2.5 text-sm transition-colors hover:bg-gold/10 ${pathname.startsWith("/entrar") ? "text-gold-300" : "text-white"}`}>
            {loginLabel}
          </Link>
          <Link
            href="/reservas"
            className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-kau-950 transition-[background-color,transform] duration-300 hover:bg-gold-300"
          >
            Reservar
          </Link>
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
        <Link href={loginHref} data-testid="mobile-top-login" onClick={() => setOpen(false)}
          className="rounded-full border border-gold/60 px-4 py-2 text-sm text-white">
          {loginLabel}
        </Link>
        <button
          type="button"
          className="relative -mr-2 grid h-11 w-11 place-items-center lg:hidden" data-testid="menu-button"
          aria-expanded={open}
          aria-controls="menu-movel"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={`absolute h-px w-6 bg-white transition-transform duration-300 ${open ? "rotate-45" : "-translate-y-1.5"}`}
          />
          <span
            className={`absolute h-px w-6 bg-white transition-transform duration-300 ${open ? "-rotate-45" : "translate-y-1.5"}`}
          />
        </button>
        </div>
      </div>

    </header>
    <SideDrawer id="menu-movel" open={open} onClose={close} label="Menu" side="right" className="px-6 pb-8 pt-16 lg:hidden">
      <nav aria-label="Menu móvel" className="-mx-1 flex-1 overflow-y-auto overscroll-contain px-1">
        <ul className="space-y-1">
          {[{ href: "/", label: "Início" }, ...nav].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={close}
                aria-current={(item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) ? "page" : undefined}
                className={`flex items-center justify-between border-b border-kau-800 py-3.5 font-display text-2xl ${
                  (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) ? "text-gold-300" : "text-white"
                }`}
              >
                {item.label}
                <span aria-hidden className="text-base text-gold-300">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6 shrink-0 space-y-3">
        <Link href="/reservas" onClick={close} className="flex h-13 items-center justify-center rounded-full bg-gold font-medium text-kau-950">
          Reservar mesa
        </Link>
        <Link href={loginHref} onClick={close} data-testid="mobile-login"
          className="flex min-h-13 flex-col items-center justify-center rounded-full border border-gold/60 px-4 py-2 text-center font-medium leading-tight text-white">
          {loginLabel}
          <span className="text-xs font-normal text-mist">{account ? "Pedidos · reservas · recibos" : "Conta · reservas · equipa"}</span>
        </Link>
      </div>
    </SideDrawer>
    </>
  );
}
