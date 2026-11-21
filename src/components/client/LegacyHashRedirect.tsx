"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Endereços antigos (/cliente#minhas-reservas, …) passam a abrir a página própria de cada opção. */
const MAP: Record<string, string> = { "#minhas-reservas": "/cliente/reservas", "#meus-pagamentos": "/cliente/pagamentos", "#meus-pedidos": "/cliente/pedidos" };
export function LegacyHashRedirect() {
  const router = useRouter();
  useEffect(() => { const to = MAP[window.location.hash]; if (to) router.replace(to); }, [router]);
  return null;
}
