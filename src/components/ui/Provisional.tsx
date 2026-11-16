import type { ReactNode } from "react";

/**
 * Marca conteúdo ainda não validado pelo restaurante. Desligar em produção
 * só quando todo o conteúdo estiver confirmado: NEXT_PUBLIC_SHOW_DRAFT=false.
 */
export const showDraft = process.env.NEXT_PUBLIC_SHOW_DRAFT !== "false";

export function Provisional({ children, className = "" }: { children: ReactNode; className?: string }) {
  if (!showDraft) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-gold-300/70 px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-gold-300 ${className}`}
    >
      <span aria-hidden>◇</span>
      {children}
    </span>
  );
}
