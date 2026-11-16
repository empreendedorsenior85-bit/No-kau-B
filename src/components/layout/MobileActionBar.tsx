import Link from "next/link";
import { mapsLinks, site } from "@/lib/site";

/** Barra fixa no telemóvel: ligar é o comportamento natural em Bissau. */
export function MobileActionBar() {
  const item = "flex flex-1 flex-col items-center justify-center gap-1 text-[0.7rem] tracking-wide";
  return (
    <nav
      aria-label="Ações rápidas"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-kau-800 bg-kau-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <a href={`tel:${site.phoneE164}`} className={`${item} text-white`}>
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
        </svg>
        Ligar
      </a>
      <Link href="/reservas" className={`${item} bg-gold font-medium text-kau-950`}>
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
        Reservar
      </Link>
      <a href={mapsLinks.directions} target="_blank" rel="noopener noreferrer" className={`${item} text-white`}>
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        Direções
      </a>
    </nav>
  );
}
