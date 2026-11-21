"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Área do cliente sempre em dia sem recarregar: volta a pedir os dados ao servidor a cada 20 s (com o separador
 * visível) e logo que o cliente volta à app/separador — ex.: o gerente confirmou um pagamento ou aprovou a reserva.
 */
export function ClientAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, 20_000);
    const onShow = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", onShow); };
  }, [router]);
  return null;
}
