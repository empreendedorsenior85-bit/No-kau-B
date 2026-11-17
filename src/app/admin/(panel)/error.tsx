"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/** Erro numa página do painel: o menu lateral continua disponível; os dados não se perdem (estão na base de dados). */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-[#e48a7d]/40 bg-[#e48a7d]/5 p-6 text-center" role="alert" data-testid="panel-error">
      <h1 className="font-display text-2xl text-white">Não foi possível abrir esta página</h1>
      <p className="mt-2 text-sm text-mist">Pode ser a ligação à internet ou a base de dados a acordar. Os pedidos e pagamentos já registados estão seguros.</p>
      <Button className="mt-5" onClick={reset}>Tentar novamente</Button>
      {error.digest && <p className="mt-4 text-xs text-mist/70">Código: {error.digest}</p>}
    </div>
  );
}
