"use client";
import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

/**
 * Imagem de produto do menu. Se não carregar (ficheiro em falta, dados corrompidos, rede):
 *  - não mostra o ícone de imagem partida — fica um fundo neutro com o mesmo tamanho (o cartão não salta);
 *  - avisa o servidor (/api/menu-image-falha), que regista a falha para o painel Imagens (monitorização).
 * Também apanha falhas que aconteceram antes de a página ficar interativa (onError ainda não existia).
 */
export function MenuImg({ itemId, className = "", alt, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { itemId?: number | string | null; alt: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  const report = () => {
    setBroken(true);
    const id = Number(itemId);
    try {
      const body = JSON.stringify({ itemId: Number.isInteger(id) ? id : null, src: ref.current?.currentSrc || String(rest.src ?? "") });
      if (!navigator.sendBeacon?.("/api/menu-image-falha", new Blob([body], { type: "application/json" })))
        fetch("/api/menu-image-falha", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    } catch {}
  };
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0 && el.getAttribute("src")) report();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (broken) return <div aria-hidden data-testid="img-broken" className={`${className} bg-kau-800/30`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt={alt} className={className} onError={report} {...rest} />;
}
