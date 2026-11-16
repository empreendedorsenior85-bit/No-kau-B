import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "dark";
type Size = "md" | "lg";

const base =
  "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-medium tracking-wide " +
  "transition-[transform,background-color,color,box-shadow,border-color] duration-300 ease-[var(--ease-luxe)] " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none";

const variants: Record<Variant, string> = {
  // ébano sobre dourado do logótipo: contraste 5.5:1 (AA)
  primary:
    "bg-gold text-kau-950 hover:bg-gold-300 hover:shadow-[0_8px_30px_-8px_rgba(198,161,91,0.55)]",
  outline:
    "border border-gold-300/60 text-gold-300 hover:border-gold-300 hover:bg-gold-300/10",
  ghost: "text-white hover:text-gold-300",
  dark: "bg-kau-950 text-white hover:bg-kau-900",
};
const sizes: Record<Size, string> = {
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-[0.95rem]",
};

/** Brilho que atravessa o botão no hover (microinteração). */
function Sheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/25 opacity-0 transition-[left,opacity] duration-700 ease-[var(--ease-luxe)] group-hover:left-[120%] group-hover:opacity-100"
    />
  );
}

type Common = { variant?: Variant; size?: Size; children: ReactNode; className?: string };

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {variant === "primary" && <Sheen />}
      <span className="relative">{children}</span>
    </Link>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: Common & ComponentProps<"button">) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {variant === "primary" && <Sheen />}
      <span className="relative">{children}</span>
    </button>
  );
}
