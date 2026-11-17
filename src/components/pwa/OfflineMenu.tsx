"use client";
import { useOffline } from "./useOffline";

/** Menu público: fica disponível sem internet depois da primeira visita. Sem interface própria. */
export function OfflineMenu({ images }: { images: string[] }) {
  useOffline(images);
  return null;
}
