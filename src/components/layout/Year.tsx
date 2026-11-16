"use client";
import { useClientValue } from "@/lib/use-client-value";

const readYear = () => new Date().getFullYear();

/** Ano corrente calculado no cliente (evita valor congelado na pré-renderização). */
export function Year() {
  const year = useClientValue(readYear);
  return <span>{year ?? ""}</span>;
}
