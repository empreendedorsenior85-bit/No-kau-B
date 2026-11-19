import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Service Worker: sempre a versão mais recente (nunca em cache do navegador) e com alcance a todo o site
  async headers() {
    return [
      {
        // Segurança em todas as páginas: o painel não pode ser embutido noutro site (clickjacking), o navegador não
        // "adivinha" tipos de ficheiro, os links externos não recebem o endereço completo e funções sensíveis ficam desligadas.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  // o PDF dos relatórios lê o logótipo oficial do disco: tem de ir dentro da função do servidor (Vercel)
  outputFileTracingIncludes: { "/admin/relatorios/pdf": ["./public/brand/logo-nokau.png"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
