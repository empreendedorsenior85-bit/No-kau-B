import type { MetadataRoute } from "next";

/** Instalação no ecrã do telemóvel (PWA). O menu e os pedidos funcionam sem internet depois do primeiro acesso. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nô Kau — Restaurante Grill, Bar & Karaoke",
    short_name: "Nô Kau",
    description: "Menu e pedidos à mesa do Nô Kau, em Bissau. Funciona também sem internet depois do primeiro acesso.",
    start_url: "/menu",
    scope: "/",
    display: "standalone",
    background_color: "#151109",
    theme_color: "#151109",
    lang: "pt-PT",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
