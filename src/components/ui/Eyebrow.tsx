import type { ReactNode } from "react";

/** Etiqueta de secção — serifada espaçada, como o lema do logótipo. */
export function Eyebrow({
  children,
  className = "",
  tone = "dark",
}: {
  children: ReactNode;
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <p
      className={`font-display text-[0.8rem] uppercase tracking-[var(--tracking-eyebrow)] ${
        tone === "dark" ? "text-gold-300" : "text-umber"
      } ${className}`}
    >
      {children}
    </p>
  );
}
