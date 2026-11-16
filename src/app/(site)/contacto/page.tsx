import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHero } from "@/components/layout/PageHero";
import { MapEmbed } from "@/components/sections/MapEmbed";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ButtonLink } from "@/components/ui/Button";
import { mapsLinks, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Nô Kau — Rua 7, Bissau, Guiné-Bissau. Telefone +245 957 616 701.",
};

export default function ContactoPage() {
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Morada", value: <>{site.address}<span className="block text-sm text-mist">Plus Code {site.plusCode}</span></> },
    { label: "Telefone", value: <a href={`tel:${site.phoneE164}`} className="hover:text-gold-300">{site.phoneDisplay}</a> },
    ...(site.whatsappE164 ? [{ label: "WhatsApp", value: <a href={`https://wa.me/${site.whatsappE164.replace("+", "")}`} className="hover:text-gold-300">Enviar mensagem</a> }] : []),
    ...(site.email ? [{ label: "Email", value: <a href={`mailto:${site.email}`} className="hover:text-gold-300">{site.email}</a> }] : []),
    { label: "Horário", value: site.hours ? site.hours.map((h) => <span key={h.days} className="block">{h.days} · {h.time}</span>) : <span className="text-mist">A confirmar — ligue-nos antes de vir.</span> },
    { label: "Redes sociais", value: <a href={site.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-gold-300">Instagram {site.instagramHandle}</a> },
  ];
  return (
    <main>
      <PageHero eyebrow="Contacto" title={<>Venha à <em className="text-gold-300">nossa casa</em>.</>} intro="Estamos na Rua 7, em Bissau." />
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:py-24">
        <div>
          <dl className="divide-y divide-kau-800 border-y border-kau-800">
            {rows.map((r) => (
              <div key={r.label} className="grid gap-1 py-5 sm:grid-cols-[140px_1fr]">
                <dt><Eyebrow>{r.label}</Eyebrow></dt>
                <dd className="text-lg text-white">{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={mapsLinks.directions} target="_blank" rel="noopener noreferrer" size="lg">Obter direções</ButtonLink>
            <ButtonLink href={`tel:${site.phoneE164}`} variant="outline" size="lg">Ligar agora</ButtonLink>
          </div>
        </div>
        <MapEmbed />
      </section>
    </main>
  );
}
