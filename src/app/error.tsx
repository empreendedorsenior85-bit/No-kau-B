"use client";

import { useEffect } from "react";
import Link from "next/link";
import { DiamondMark } from "@/components/brand/DiamondPattern";
import { Button } from "@/components/ui/Button";

/** Erro inesperado numa página: a pessoa pode tentar de novo sem perder o resto do site. */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="grid min-h-svh place-items-center bg-kau-950 px-6 text-center">
      <div>
        <DiamondMark className="mx-auto text-gold" size={56} />
        <h1 className="mt-6 font-display text-3xl text-white">Algo correu mal</h1>
        <p className="mt-3 max-w-sm text-mist">Pode ser a ligação à internet ou o servidor a acordar. Tente novamente dentro de instantes.</p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={reset}>Tentar novamente</Button>
          <Link href="/" className="text-sm text-gold-300 underline underline-offset-4">Voltar ao início</Link>
        </div>
        {error.digest && <p className="mt-6 text-xs text-mist/70">Código: {error.digest}</p>}
      </div>
    </main>
  );
}
