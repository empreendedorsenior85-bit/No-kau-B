import type { ReactNode } from "react";
import { isLocalServer } from "@/lib/node-role";

/**
 * No servidor local do restaurante, menu/mesas/utilizadores vêm do central: a página fica só de leitura
 * (todos os controlos desativados pelo próprio HTML) e explica onde se altera.
 */
export function LocalReadOnly({ children, what }: { children: ReactNode; what: string }) {
  if (!isLocalServer()) return <>{children}</>;
  return (
    <>
      <p role="note" data-testid="local-readonly" className="mb-6 rounded-2xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm leading-relaxed text-gold-300">
        Servidor local do restaurante: {what} só se altera(m) no site central. As alterações chegam aqui automaticamente na sincronização seguinte.
      </p>
      <fieldset disabled className="contents">{children}</fieldset>
    </>
  );
}
