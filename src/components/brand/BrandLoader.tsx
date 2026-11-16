/** Carregamento com identidade: losangos desenhados em traço dourado (CSS puro, sem JS). */
export function BrandLoader({ label = "A carregar…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 text-gold">
      <svg width="56" height="56" viewBox="0 0 40 40" className="nk-draw" aria-hidden>
        <path d="M20 2 L38 20 L20 38 L2 20 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M20 10 L30 20 L20 30 L10 20 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M20 16 L24 20 L20 24 L16 20 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="font-display text-sm italic tracking-wide text-gold-300">{label}</span>
    </div>
  );
}
