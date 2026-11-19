import type { ReactNode } from "react";
import type { Receipt } from "@/lib/payments";
import { getReceiptSettings } from "@/lib/receipt/store";
import { receiptData } from "@/lib/receipt/data";
import { receiptDoc } from "@/lib/receipt/doc";
import { site } from "@/lib/site";
import { ThermalPaper } from "./ThermalPaper";
import { PrintButton } from "./PrintButton";

/**
 * Recibo de um pagamento com a personalização do restaurante (cabeçalho, informações, rodapé, QR, largura, tamanho).
 * O mesmo desenho do talão térmico; ao imprimir no navegador sai só o recibo, a preto e branco.
 * `onlyCustomer`: na conta do cliente, os pedidos de outras pessoas da mesma conta aparecem só como total.
 */
export async function ReceiptView({ receipt, onlyCustomer, actions }: { receipt: Receipt; onlyCustomer?: string; actions?: ReactNode }) {
  const { settings, hasLogo, logoVersion } = await getReceiptSettings();
  const doc = receiptDoc(settings, await receiptData(receipt, onlyCustomer), { address: site.address, phone: site.phoneDisplay });
  return (
    <article data-testid="receipt" data-status={receipt.payment.status} className="mx-auto w-fit max-w-full">
      <div className="overflow-x-auto print:overflow-visible">
        <ThermalPaper doc={doc} logoUrl={hasLogo ? `/api/receipt-logo?v=${logoVersion}` : null} />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 print:hidden">
        <PrintButton />
        {actions}
      </div>
      <p className="mt-3 text-center text-xs text-mist print:hidden">Comprovativo interno do restaurante — não substitui fatura.</p>
    </article>
  );
}
