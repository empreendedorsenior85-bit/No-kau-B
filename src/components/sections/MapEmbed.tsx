"use client";
import { useState } from "react";
import { mapsLinks, site } from "@/lib/site";
import { DiamondMark } from "@/components/brand/DiamondPattern";

/**
 * Mapa carregado só a pedido (poupa dados móveis e não envia pedidos à Google sem ação do utilizador).
 * Usa a Maps Embed API oficial — exige NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY restrita ao domínio.
 */
export function MapEmbed() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  const [show, setShow] = useState(false);

  if (show && key) {
    return (
      <iframe
        title={`Mapa — ${site.name}, ${site.address}`}
        src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(site.plusCode)}`}
        className="h-full min-h-[360px] w-full rounded-[1.75rem] border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    );
  }
  return (
    <div className="relative flex h-full min-h-[360px] flex-col items-center justify-center gap-5 overflow-hidden rounded-[1.75rem] border border-kau-800 bg-kau-900 p-8 text-center">
      <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--color-gold)_1px,transparent_1px),linear-gradient(90deg,var(--color-gold)_1px,transparent_1px)] [background-size:40px_40px]" />
      <DiamondMark className="relative text-gold" size={48} />
      <p className="relative font-display text-2xl text-white">{site.address}</p>
      <p className="relative text-sm text-mist">Plus Code {site.plusCode}</p>
      <div className="relative flex flex-col gap-3 sm:flex-row">
        {key && (
          <button onClick={() => setShow(true)} className="h-11 rounded-full bg-gold px-6 text-sm font-medium text-kau-950 hover:bg-gold-300">
            Mostrar mapa
          </button>
        )}
        <a href={mapsLinks.search} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-full border border-gold-300/60 px-6 text-sm text-gold-300 hover:bg-gold-300/10">
          Abrir no Google Maps
        </a>
      </div>
    </div>
  );
}
