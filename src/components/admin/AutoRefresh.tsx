"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLive } from "./LiveOrders";

/**
 * Mantém os números do servidor em dia: atualiza quando entra ou muda um pedido (em tempo real)
 * e, por segurança, a cada minuto com o separador visível. Não recarrega a página.
 */
export function AutoRefresh() {
  const router = useRouter();
  const { orders, loaded } = useLive();
  const rev = orders.reduce((m, o) => Math.max(m, o.rev), 0);
  const first = useRef(true);

  useEffect(() => {
    if (!loaded) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => router.refresh(), 1200);
    return () => clearTimeout(t);
  }, [rev, loaded, router]);

  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, 60_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
