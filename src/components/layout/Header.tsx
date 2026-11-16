"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { nav } from "@/lib/site";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  // O menu fica associado à rota em que foi aberto: ao navegar, fecha automaticamente.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (v: boolean | ((p: boolean) => boolean)) =>
    setOpenPath((cur) => {
      const next = typeof v === "function" ? v(cur === pathname) : v;
      return next ? pathname : null;
    });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // bloqueia o scroll do fundo enquanto o menu está aberto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenPath(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
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
          <Link
            href="/reservas"
            className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-kau-950 transition-[background-color,transform] duration-300 hover:bg-gold-300"
          >
            Reservar
          </Link>
        </nav>

        <button
          type="button"
          className="relative -mr-2 grid h-11 w-11 place-items-center lg:hidden"
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

      {/* Menu móvel */}
      <div
        id="menu-movel"
        hidden={!open}
        className="h-[calc(100svh-4rem)] overflow-y-auto border-t border-kau-800 bg-kau-950 px-6 pb-28 pt-8 lg:hidden"
      >
        <nav aria-label="Menu móvel">
          <ul className="space-y-1">
            {[{ href: "/", label: "Início" }, ...nav].map((item, i) => (
              <li key={item.href} style={{ animationDelay: `${i * 50}ms` }} className="animate-[nk-in_.5s_var(--ease-luxe)_both]">
                <Link
                  href={item.href}
                  className={`flex items-center justify-between border-b border-kau-800 py-4 font-display text-3xl ${
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
        <Link
          href="/reservas"
          className="mt-8 flex h-13 items-center justify-center rounded-full bg-gold font-medium text-kau-950"
        >
          Reservar mesa
        </Link>
      </div>
    </header>
  );
}
