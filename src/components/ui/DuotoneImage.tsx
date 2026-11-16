import Image, { type ImageProps } from "next/image";

/** Tratamento a duas cores derivado do retrato do logótipo. Só para imagens culturais. */
export function DuotoneImage({ className = "", ...props }: ImageProps & { className?: string }) {
  return (
    <div className={`duotone relative overflow-hidden ${className}`}>
      <Image {...props} alt={props.alt} className="object-cover" />
    </div>
  );
}
