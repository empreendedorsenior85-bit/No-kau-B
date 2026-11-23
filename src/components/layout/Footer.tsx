import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { DiamondBand } from "@/components/brand/DiamondPattern";
import { Year } from "./Year";
import { mapsLinks, nav, site, socials } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-kau-800 bg-kau-950 pb-24 lg:pb-0">
      <DiamondBand className="text-gold" opacity={0.25} id="band-footer" />
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo size={112} />
          <p className="mt-5 font-display text-sm uppercase tracking-[var(--tracking-eyebrow)] text-gold-300">
            {site.tagline}
          </p>
        </div>
        <div>
          <h2 className="font-display text-lg text-white">Visite-nos</h2>
          <p className="mt-4 text-mist">{site.address}</p>
          <p className="text-sm text-mist">Plus Code {site.plusCode}</p>
          <a href={mapsLinks.directions} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-gold-300 underline-offset-4 hover:underline">
            Obter direções →
          </a>
        </div>
        <div>
          <h2 className="font-display text-lg text-white">Contacto</h2>
          <a href={`tel:${site.phoneE164}`} className="mt-4 block text-mist hover:text-gold-300">
            {site.phoneDisplay}
          </a>
          {site.email && (
            <a href={`mailto:${site.email}`} className="block text-mist hover:text-gold-300">
              {site.email}
            </a>
          )}
          <ul className="mt-1 space-y-0.5" aria-label="Redes sociais" data-testid="footer-socials">
            {socials.map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="block text-mist hover:text-gold-300">
                  {s.name} {s.handle}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-mist">
            Horário: {site.hours ? site.hours.map((h) => `${h.days} ${h.time}`).join(" · ") : "a confirmar — ligue-nos"}
          </p>
        </div>
        <nav aria-label="Rodapé">
          <h2 className="font-display text-lg text-white">Explorar</h2>
          <ul className="mt-4 space-y-2">
            {[...nav, { href: "/reservas", label: "Reservas" }].map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-mist hover:text-gold-300">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-kau-800">
        <p className="mx-auto max-w-7xl px-6 py-6 text-xs text-mist sm:px-8">
          © <Year /> Nô Kau · Bissau, Guiné-Bissau
        </p>
      </div>
    </footer>
  );
}
