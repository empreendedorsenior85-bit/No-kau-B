/** Preços em francos CFA (XOF), inteiros. Ex.: 6500 → "6 500 FCFA" conforme a locale. */
export function formatXOF(amount: number, locale = "pt-PT"): string {
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: "always" }).format(amount);
  return `${n} FCFA`;
}

/** Espera em minutos → texto legível: "8 min", "2 h 5 min", "3 d". */
export function formatWait(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `${Math.floor(min / 1440)} d`;
}
