/** Linha ondulada inspirada no rodapé em chapa de zinco do salão. */
export function ZincDivider({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 240 12" preserveAspectRatio="none" className={`block h-3 w-full ${className}`}>
      <path
        d="M0 6 Q5 0 10 6 T20 6 T30 6 T40 6 T50 6 T60 6 T70 6 T80 6 T90 6 T100 6 T110 6 T120 6 T130 6 T140 6 T150 6 T160 6 T170 6 T180 6 T190 6 T200 6 T210 6 T220 6 T230 6 T240 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
