import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { WhatsAppFloat } from "@/components/layout/WhatsAppFloat";
import { ReservationNotifier } from "@/components/reservations/ReservationNotifier";
import { site } from "@/lib/site";

/** Dados estruturados apenas com factos confirmados (sem horário, sem avaliações). */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: site.name,
  description: site.tagline,
  telephone: site.phoneE164,
  url: site.siteUrl,
  image: `${site.siteUrl}/brand/logo-nokau.png`,
  sameAs: [site.instagram],
  address: { "@type": "PostalAddress", streetAddress: site.street, addressLocality: site.city, addressCountry: site.country },
  acceptsReservations: true,
};

/** Site público: cabeçalho, rodapé e barra de ações. As áreas /m (clientes) e /admin (gerente) são aplicações à parte. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#conteudo" className="sr-only z-[60] rounded-full bg-gold px-4 py-2 text-kau-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Saltar para o conteúdo
      </a>
      <Header />
      <div id="conteudo">{children}</div>
      <Footer />
      <MobileActionBar />
      <WhatsAppFloat />
      <ReservationNotifier />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
