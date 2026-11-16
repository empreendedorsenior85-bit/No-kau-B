import Image from "next/image";

type Props = { size?: number; className?: string; priority?: boolean };

/** Logótipo oficial (raster provisório — substituir pelo ficheiro vetorial original quando disponível). */
export function Logo({ size = 96, className, priority }: Props) {
  return (
    <Image
      src="/brand/logo-nokau.png"
      alt="Nô Kau — Restaurante Grill, Bar & Karaoke"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
