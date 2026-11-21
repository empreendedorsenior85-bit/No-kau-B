"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Menu lateral (gaveta) usado em telemóvel e tablet — o mesmo comportamento em todas as áreas da plataforma:
 *  - abre a partir do lado indicado, com fundo escurecido;
 *  - fecha com o botão ✕, com Esc, ao tocar fora e (no componente que o usa) ao navegar;
 *  - bloqueia o scroll da página por trás e mantém o foco do teclado dentro do menu;
 *  - o conteúdo só existe no DOM enquanto está aberto (e durante a animação de fecho): fechado, a navegação
 *    não fica duplicada (a barra lateral do computador já a tem) nem é lida por leitores de ecrã.
 * A largura adapta-se ao ecrã (até 20rem, nunca mais de 86% da largura) e o conteúdo tem scroll próprio.
 */
export function SideDrawer({ id, open, onClose, label, side = "left", children, className = "" }: {
  id: string; open: boolean; onClose: () => void; label: string; side?: "left" | "right"; children: ReactNode; className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // conteúdo montado ao abrir; desmontado 320 ms depois de fechar (fim da animação)
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open, mounted]);
  const opener = useRef<Element | null>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // foco no primeiro elemento do menu
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const els = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex='-1'])")];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  const closedX = side === "left" ? "-translate-x-full" : "translate-x-full";
  return (
    <div className={`fixed inset-0 z-[60] transition-[visibility] duration-300 print:hidden ${open ? "visible" : "pointer-events-none invisible"}`} inert={!open} aria-hidden={!open} data-open={open ? "true" : "false"}>
      <div onClick={onClose} aria-hidden className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <div ref={panel} id={id} role="dialog" aria-modal="true" aria-label={label}
        className={`absolute inset-y-0 ${side === "left" ? "left-0 border-r" : "right-0 border-l"} w-[min(20rem,86vw)] border-kau-800 bg-kau-950 shadow-2xl shadow-black/60 transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? "translate-x-0" : closedX}`}
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className={`relative flex h-full flex-col ${className}`}>
        <button type="button" onClick={onClose} aria-label="Fechar menu" data-testid="drawer-close"
          className={`absolute top-3 ${side === "left" ? "right-3" : "left-3"} z-10 grid h-10 w-10 place-items-center rounded-full text-mist hover:bg-kau-900 hover:text-white`}>
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {mounted && children}
        </div>
      </div>
    </div>
  );
}

/** Botão ☰ que abre o menu lateral (mesmo desenho em todas as áreas). */
export function MenuButton({ open, onClick, controls, className = "" }: { open: boolean; onClick: () => void; controls: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-controls={controls} aria-label={open ? "Fechar menu" : "Abrir menu"} data-testid="menu-button"
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white hover:bg-kau-900 ${className}`}>
      <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    </button>
  );
}
