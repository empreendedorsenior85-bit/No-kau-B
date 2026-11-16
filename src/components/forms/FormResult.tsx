"use client";
import { useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";
import { site, smsLink } from "@/lib/site";
import { Button } from "@/components/ui/Button";

/**
 * Resultado honesto do envio. Enquanto não houver backend (Fase 4), o pedido
 * NÃO chega sozinho ao restaurante: o cliente conclui por SMS ou chamada.
 */
export function FormResult({ state, onReset, kind }: { state: FormState; onReset: () => void; kind: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);

  if (state.status === "delivered") {
    return (
      <div ref={ref} tabIndex={-1} role="status" className="rounded-2xl border border-ok/40 bg-ok/10 p-6 outline-none">
        <h3 className="font-display text-2xl text-white">Pedido recebido</h3>
        <p className="mt-2 text-mist">
          Referência <strong className="text-white">{state.reference}</strong>. O seu pedido de {kind} fica{" "}
          <strong className="text-white">pendente</strong> até o restaurante o confirmar por telefone.
        </p>
      </div>
    );
  }
  if (state.status !== "manual") return null;
  return (
    <div ref={ref} tabIndex={-1} role="status" className="rounded-2xl border border-gold/50 bg-kau-900 p-6 outline-none">
      <h3 className="font-display text-2xl text-white">Falta um passo</h3>
      <p className="mt-2 leading-relaxed text-mist">
        Os seus dados estão corretos. Para o restaurante receber o pedido de {kind}, envie-o por SMS (a mensagem já
        está escrita) ou ligue-nos. O pedido só fica confirmado quando o Nô Kau responder.
      </p>
      <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-kau-950 p-4 font-sans text-sm text-white/90">{state.summary}</pre>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a
          href={smsLink(state.summary)}
          className="inline-flex h-12 items-center justify-center rounded-full bg-gold px-6 text-sm font-medium text-kau-950 transition-colors hover:bg-gold-300"
        >
          Enviar por SMS
        </a>
        <a
          href={`tel:${site.phoneE164}`}
          className="inline-flex h-12 items-center justify-center rounded-full border border-gold-300/60 px-6 text-sm text-gold-300 hover:bg-gold-300/10"
        >
          Ligar {site.phoneDisplay}
        </a>
        <Button variant="ghost" type="button" onClick={onReset}>
          Editar dados
        </Button>
      </div>
    </div>
  );
}
