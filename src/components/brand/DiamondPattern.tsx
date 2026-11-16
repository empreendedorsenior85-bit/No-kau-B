/**
 * Motivo inspirado no caminho de mesa tecido do salão (losangos concêntricos).
 * Usado como faixa decorativa, divisor e marca d'água.
 */
type Props = { className?: string; opacity?: number; id?: string };

export function DiamondBand({ className = "", opacity = 0.5, id = "nk-diamond" }: Props) {
  return (
    <svg aria-hidden className={`block h-6 w-full ${className}`} style={{ opacity }}>
      <defs>
        <pattern id={id} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M12 1 L23 12 L12 23 L1 12 Z" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M12 6 L18 12 L12 18 L6 12 Z" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M12 10 L14 12 L12 14 L10 12 Z" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export function DiamondMark({ className = "", size = 40 }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 40 40" className={className}>
      <path d="M20 2 L38 20 L20 38 L2 20 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 10 L30 20 L20 30 L10 20 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 16 L24 20 L20 24 L16 20 Z" fill="currentColor" />
    </svg>
  );
}
