import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
// Playfair (títulos) sem pré-carregamento: em rede lenta não compete com o JavaScript; o texto aparece logo (swap)
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], style: ["normal", "italic"], display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(site.siteUrl),
  title: { default: "Nô Kau — Restaurante Grill, Bar & Karaoke em Bissau", template: "%s · Nô Kau" },
  description:
    "Onde a gastronomia encontra a cultura. Grill, bar, cocktails, música ao vivo e karaoke na Rua 7, em Bissau, Guiné-Bissau.",
  applicationName: "Nô Kau",
  openGraph: { type: "website", locale: "pt_PT", siteName: "Nô Kau" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = { themeColor: "#151109", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-PT" className={`${inter.variable} ${playfair.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-svh">
        {children}
      </body>
    </html>
  );
}
