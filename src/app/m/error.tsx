"use client";

import { DiamondMark } from "@/components/brand/DiamondPattern";
import { Button } from "@/components/ui/Button";

/** Se o menu ou a confirmação não carregarem (rede, base de dados a acordar), o cliente pode tentar de novo. */
export default function MenuError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-svh place-items-center bg-kau-950 px-6 text-center">
      <div>
        <DiamondMark className="mx-auto text-gold" size={56} />
        <h1 className="mt-6 font-display text-3xl text-white">Não foi possível carregar</h1>
        <p className="mt-3 max-w-sm text-mist">Pode ser a ligação à internet. Tente novamente — o seu pedido não se perde.</p>
        <Button className="mt-6" size="lg" onClick={reset}>Tentar novamente</Button>
      </div>
    </main>
  );
}
