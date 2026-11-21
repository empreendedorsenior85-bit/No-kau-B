import { Suspense, type ReactNode } from "react";
import { getCustomer } from "@/lib/customers";
import { ClientNav } from "@/components/client/ClientNav";
import { ClientAutoRefresh } from "@/components/client/ClientAutoRefresh";

/**
 * Moldura da área do cliente (Resumo, Reservas, Pagamentos, Pedidos, Recibos): UM só menu, que fica montado
 * enquanto se muda de página — só o conteúdo muda. Sem sessão, cada página envia para o login (com regresso).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="nums-lining min-h-svh bg-kau-950 lg:pl-64 print:bg-white print:pl-0">
      <Suspense fallback={null}><Frame /></Suspense>
      {children}
    </div>
  );
}

async function Frame() {
  const c = await getCustomer().catch(() => null);
  if (!c) return null;
  return (
    <>
      <ClientNav name={c.name} email={c.email} />
      <ClientAutoRefresh />
    </>
  );
}
