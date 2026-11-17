"use client";

/** Imprimir (ou guardar em PDF) pelo navegador — para entregar o comprovativo ao cliente. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} data-testid="receipt-print"
      className="rounded-full border border-gold/60 px-5 py-2.5 text-sm text-gold-300 hover:bg-gold/10">
      Imprimir / guardar PDF
    </button>
  );
}
