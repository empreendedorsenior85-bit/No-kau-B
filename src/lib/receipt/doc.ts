import { columnsFor, type PaperWidth, type ReceiptSettings, type TextSize } from "./settings";
import { PAYMENT_SHORT } from "@/lib/types";

/**
 * Descrição de um recibo/talão em blocos. A MESMA descrição gera os bytes ESC/POS (impressão real),
 * a pré-visualização na página de configuração e o recibo no ecrã — o que se vê é o que sai na impressora.
 */
export type Align = "left" | "center" | "right";
export type Block =
  | { t: "text"; text: string; align?: Align; bold?: boolean; big?: boolean; id?: string }
  | { t: "row"; left: string; right: string; bold?: boolean; big?: boolean; id?: string }
  | { t: "rule"; char?: string }
  | { t: "feed"; n?: number }
  | { t: "logo" }
  | { t: "qr"; data: string }
  | { t: "cut" };

export type Doc = { paper: PaperWidth; textSize: TextSize; cols: number; blocks: Block[] };

const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0, useGrouping: "always" });
/** Valor com a moeda (o texto vai para a impressora: sem espaços especiais). */
export const money = (n: number, currency: boolean) => `${nf.format(n).replace(/\s/g, " ")}${currency ? " FCFA" : ""}`;
const TZ = "Africa/Bissau";
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** Nome do método no recibo (curto: cabe ao lado de "Método" no papel de 58 mm). Mesma fonte que o resto do sistema. */
export const METHOD_LABEL: Record<string, string> = PAYMENT_SHORT;

/** Divide um texto em linhas que cabem na largura (por palavras). */
export function wrapText(s: string, cols: number): string[] {
  const out: string[] = [];
  for (const para of s.split(/\n/)) {
    let cur = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const word = w.length > cols ? w.slice(0, cols) : w;
      if ((cur ? cur.length + 1 : 0) + word.length <= cols) cur = cur ? `${cur} ${word}` : word;
      else { if (cur) out.push(cur); cur = word; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Linhas de duas colunas (texto à esquerda com quebra, valor encostado à direita). */
export function rowLines(left: string, right: string, cols: number): string[] {
  const room = Math.max(4, cols - right.length - 1);
  const parts = wrapText(left, room);
  if (!parts.length) parts.push("");
  return parts.map((l, i) => (i === parts.length - 1 ? `${l}${" ".repeat(Math.max(1, cols - l.length - right.length))}${right}` : l));
}

// ---------------------------------------------------------------- recibo de pagamento
export type ReceiptData = {
  demo?: boolean;
  receiptNumber: string;
  createdAt: string;
  tableLabel: string;
  staff: string | null;
  customer: { name: string; phone: string } | null;
  status: "confirmed" | "voided";
  voided?: { at: string | null; by: string | null; reason: string | null };
  orders: { number: string; items: { name: string; quantity: number; unitPrice: number }[] | null; total: number }[];
  total: number;
  method: string;
  tendered: number | null;
  change: number | null;
  note: string | null;
  printedAt: string;
};

function header(s: ReceiptSettings, b: Block[], contacts: { address: string; phone: string }) {
  if (s.header.showLogo) b.push({ t: "logo" });
  if (s.header.showStoreName) b.push({ t: "text", text: s.header.storeName, align: "center", bold: true, big: true, id: "store-name" });
  if (s.header.showContacts) b.push({ t: "text", text: `${contacts.address} · ${contacts.phone}`, align: "center" });
  if (s.header.headerText) b.push({ t: "text", text: s.header.headerText, align: "center", id: "header-text" });
}

function footer(s: ReceiptSettings, b: Block[], printedAt: string) {
  const f = s.footer;
  if (f.nif || f.returns || f.legal) {
    b.push({ t: "rule" });
    if (f.nif) b.push({ t: "text", text: `NIF: ${f.nif}`, id: "nif" });
    if (f.returns) b.push({ t: "text", text: f.returns });
    if (f.legal) b.push({ t: "text", text: f.legal });
  }
  if (f.qr && f.qrUrl) {
    b.push({ t: "feed" }, { t: "qr", data: f.qrUrl });
    if (f.qrText) b.push({ t: "text", text: f.qrText, align: "center", id: "qr-text" });
  }
  if (f.thanks) b.push({ t: "feed" }, { t: "text", text: f.thanks, align: "center", bold: true, id: "thanks" });
  if (f.note) b.push({ t: "text", text: f.note, align: "center", id: "note" });
  if (f.printedAt) b.push({ t: "text", text: `Impresso em ${fmtDate(printedAt)} ${fmtTime(printedAt)}`, align: "center", id: "printed-at" });
}

/** Recibo de pagamento (comprovativo) com as opções da configuração — só dados reais do pagamento. */
export function receiptDoc(s: ReceiptSettings, d: ReceiptData, contacts: { address: string; phone: string }, paper: PaperWidth = s.format.paper): Doc {
  const cols = columnsFor(paper, s.format.textSize);
  const c = s.finance.currency;
  const b: Block[] = [];
  if (d.demo) b.push({ t: "text", text: "*** DEMONSTRAÇÃO - NÃO É UMA VENDA ***", align: "center", bold: true, id: "demo" });
  header(s, b, contacts);
  b.push({ t: "rule" }, { t: "text", text: "RECIBO DE PAGAMENTO", align: "center", bold: true });
  if (s.sale.number) b.push({ t: "text", text: d.receiptNumber, align: "center", bold: true, big: true, id: "receipt-number" });
  const when = [s.sale.date ? fmtDate(d.createdAt) : "", s.sale.time ? fmtTime(d.createdAt) : ""].filter(Boolean).join(", ");
  if (when) b.push({ t: "text", text: when, align: "center", id: "sale-when" });
  if (s.sale.table) b.push({ t: "text", text: d.tableLabel, align: "center" });
  b.push({ t: "text", text: d.status === "voided" ? "*** ANULADO ***" : "Pago · confirmado", align: "center", bold: true, id: "receipt-status" });
  if (d.customer && (s.customer.name || s.customer.phone)) {
    b.push({ t: "rule" });
    if (s.customer.name && d.customer.name) b.push({ t: "text", text: `Cliente: ${d.customer.name}`, id: "customer-name" });
    if (s.customer.phone && d.customer.phone) b.push({ t: "text", text: `Telefone: ${d.customer.phone}`, id: "customer-phone" });
  }
  b.push({ t: "rule" });
  for (const o of d.orders) {
    b.push({ t: "text", text: `Pedido ${o.number}`, bold: true });
    if (!o.items) b.push({ t: "row", left: "Outros consumos da mesa", right: money(o.total, c) });
    else for (const i of o.items) {
      b.push({ t: "row", left: `${i.quantity}x ${i.name}`, right: money(i.quantity * i.unitPrice, c) });
      if (i.quantity > 1) b.push({ t: "text", text: `   (${money(i.unitPrice, c)} cada)` });
    }
  }
  if (!d.orders.length) b.push({ t: "text", text: "Pedidos não disponíveis neste servidor." });
  b.push({ t: "rule" });
  if (s.finance.subtotal) b.push({ t: "row", left: "Subtotal", right: money(d.orders.reduce((n, o) => n + o.total, 0), c), id: "subtotal" });
  if (s.finance.total) b.push({ t: "row", left: "TOTAL PAGO", right: money(d.total, c), bold: true, big: true, id: "receipt-total" });
  if (s.finance.method) b.push({ t: "row", left: "Método", right: METHOD_LABEL[d.method] ?? d.method, id: "method" });
  // valor entregue e troco: só em dinheiro e quando foram registados
  if (d.method === "cash" && d.tendered != null) {
    if (s.finance.tendered) b.push({ t: "row", left: "Entregue", right: money(d.tendered, c), id: "tendered" });
    if (s.finance.change) b.push({ t: "row", left: "Troco", right: money(d.change ?? 0, c), id: "change" });
  }
  if (s.finance.currency) b.push({ t: "text", text: "Moeda: Franco CFA (XOF)", id: "currency" });
  if (s.sale.staff && d.staff) b.push({ t: "text", text: `Recebido por: ${d.staff}`, id: "staff" });
  if (d.note) b.push({ t: "text", text: `Nota: ${d.note}` });
  if (d.status === "voided" && d.voided) {
    b.push({ t: "rule" }, { t: "text", text: `ANULADO em ${d.voided.at ? `${fmtDate(d.voided.at)} ${fmtTime(d.voided.at)}` : "-"} por ${d.voided.by ?? "-"}: ${d.voided.reason ?? ""}`, bold: true, id: "void" });
  }
  footer(s, b, d.printedAt);
  b.push({ t: "feed", n: 2 }, { t: "cut" });
  return { paper, textSize: s.format.textSize, cols, blocks: b };
}

// ---------------------------------------------------------------- talão de cozinha / balcão
export type OrderTicketData = {
  demo?: boolean; station: "kitchen" | "counter"; printerName: string; tableLabel: string; orderNumber: string; createdAt: string;
  acceptedBy: string | null; customer: { name: string; phone: string } | null; reprint: boolean; isTest: boolean;
  items: { name: string; quantity: number; unitPrice: number; note: string | null }[]; total: number;
};

/** Talão para a cozinha/balcão: as informações da venda e do cliente seguem a configuração; sem publicidade nem QR. */
export function orderTicketDoc(s: ReceiptSettings, d: OrderTicketData, paper: PaperWidth): Doc {
  const cols = columnsFor(paper, s.format.textSize);
  const c = s.finance.currency;
  const b: Block[] = [];
  if (d.demo) b.push({ t: "text", text: "*** DEMONSTRAÇÃO ***", align: "center", bold: true });
  b.push({ t: "text", text: s.header.storeName.toUpperCase(), align: "center", bold: true, big: true });
  b.push({ t: "text", text: d.station === "kitchen" ? "*** COZINHA ***" : "*** BALCÃO / BAR ***", align: "center" });
  if (d.reprint) b.push({ t: "text", text: "*** REIMPRESSÃO ***", align: "center", bold: true });
  if (d.isTest) b.push({ t: "text", text: "PEDIDO DE TESTE (demonstração)", align: "center", bold: true });
  b.push({ t: "feed" }, { t: "text", text: d.tableLabel, align: "center", bold: true, big: true });
  if (s.sale.number) b.push({ t: "text", text: `Pedido ${d.orderNumber}`, align: "center", bold: true });
  const when = [s.sale.date ? fmtDate(d.createdAt) : "", s.sale.time ? fmtTime(d.createdAt) : ""].filter(Boolean).join(", ");
  if (when) b.push({ t: "text", text: when, align: "center" });
  if (s.sale.staff && d.acceptedBy) b.push({ t: "text", text: `Aceite por: ${d.acceptedBy}`, align: "center" });
  if (d.customer && s.customer.name && d.customer.name) b.push({ t: "text", text: `Cliente: ${d.customer.name}`, align: "center" });
  if (d.customer && s.customer.phone && d.customer.phone) b.push({ t: "text", text: `Tel.: ${d.customer.phone}`, align: "center" });
  b.push({ t: "rule" });
  for (const it of d.items) {
    b.push({ t: "row", left: `${it.quantity}x ${it.name}`, right: money(it.unitPrice * it.quantity, c), bold: true });
    if (it.quantity > 1) b.push({ t: "text", text: `   (${money(it.unitPrice, c)} cada)` });
    if (it.note) for (const l of wrapText(`>> ${it.note}`, cols - 3)) b.push({ t: "text", text: `   ${l}`, bold: true });
  }
  b.push({ t: "rule" });
  if (s.finance.total) b.push({ t: "row", left: "TOTAL", right: money(d.total, c), bold: true, big: true });
  b.push({ t: "feed" }, { t: "text", text: d.printerName, align: "center" }, { t: "feed", n: 2 }, { t: "cut" });
  return { paper, textSize: s.format.textSize, cols, blocks: b };
}

// ---------------------------------------------------------------- dados de demonstração (pré-visualização)
export function demoReceipt(now = new Date().toISOString()): ReceiptData {
  return {
    demo: true, receiptNumber: "REC-000000", createdAt: now, tableLabel: "Mesa 4", staff: "Gerente (exemplo)",
    customer: { name: "Cliente de Exemplo", phone: "+245 955 000 000" }, status: "confirmed",
    orders: [{ number: "#0000", total: 16500, items: [
      { name: "Frango Churrasco", quantity: 2, unitPrice: 6000 }, { name: "Sumo Natural", quantity: 1, unitPrice: 2500 }, { name: "Água 0,5 L", quantity: 2, unitPrice: 1000 },
    ] }],
    total: 16500, method: "cash", tendered: 20000, change: 3500, note: null, printedAt: now,
  };
}
export function demoOrderTicket(now = new Date().toISOString()): OrderTicketData {
  return {
    demo: true, station: "kitchen", printerName: "Cozinha", tableLabel: "Mesa 4", orderNumber: "#0000", createdAt: now, acceptedBy: "Gerente (exemplo)",
    customer: { name: "Cliente de Exemplo", phone: "+245 955 000 000" }, reprint: false, isTest: false,
    items: [{ name: "Frango Churrasco", quantity: 2, unitPrice: 6000, note: "sem picante, bem passado" }, { name: "Arroz", quantity: 1, unitPrice: 1500, note: null }],
    total: 13500,
  };
}
