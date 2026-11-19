import { z } from "zod";

/**
 * Personalização dos recibos e talões (uma configuração por estabelecimento).
 * Partilhado entre servidor (impressão ESC/POS, validação) e navegador (página de configuração, pré-visualização).
 */
export type TextSize = "small" | "medium" | "large";
export type PaperWidth = 58 | 80;

const bool = z.boolean();
const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);

export const receiptSettingsSchema = z.object({
  header: z.object({
    showLogo: bool, showStoreName: bool, storeName: text(40).min(1, "Indique o nome da loja."), showContacts: bool, headerText: text(160),
  }),
  sale: z.object({ number: bool, date: bool, time: bool, staff: bool, table: bool }),
  customer: z.object({ name: bool, phone: bool }),
  finance: z.object({ subtotal: bool, total: bool, method: bool, tendered: bool, change: bool, currency: bool }),
  footer: z.object({
    qr: bool,
    qrUrl: z.string().trim().max(200).refine((v) => v === "" || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(v), "O endereço da loja online tem de começar por https://"),
    qrText: text(80), thanks: text(200), printedAt: bool, note: text(240),
    nif: z.string().trim().max(30).refine((v) => v === "" || /^[A-Za-z0-9 ./-]{3,30}$/.test(v), "NIF inválido."),
    returns: text(240), legal: text(240),
  }),
  format: z.object({ paper: z.union([z.literal(58), z.literal(80)]), textSize: z.enum(["small", "medium", "large"]) }),
  /** No servidor do restaurante: imprimir o recibo no balcão quando o pagamento é confirmado. */
  autoPrintReceipt: bool,
});
export type ReceiptSettings = z.infer<typeof receiptSettingsSchema>;

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  header: {
    showLogo: true, showStoreName: true, storeName: "Nô Kau", showContacts: true,
    headerText: "Bem-vindo ao nosso restaurante! Obrigado por escolher os nossos serviços.",
  },
  sale: { number: true, date: true, time: true, staff: true, table: true },
  customer: { name: true, phone: false },
  finance: { subtotal: true, total: true, method: true, tendered: true, change: true, currency: true },
  footer: {
    qr: false, qrUrl: "", qrText: "Visite a nossa loja online.",
    thanks: "Obrigado pela sua preferência! Foi um prazer servir-lhe. Esperamos recebê-lo novamente.",
    printedAt: true,
    note: "Conserve este recibo como comprovativo da sua compra. Para informações ou reclamações, entre em contacto connosco.",
    nif: "", returns: "", legal: "",
  },
  format: { paper: 80, textSize: "medium" },
  autoPrintReceipt: false,
};

/** Junta o que está guardado com os valores padrão (campos novos de versões futuras ficam com o padrão). */
export function withDefaults(stored: unknown): ReceiptSettings {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<keyof ReceiptSettings, unknown>>;
  const merged = Object.fromEntries(Object.entries(DEFAULT_RECEIPT_SETTINGS).map(([k, v]) => [
    k, v && typeof v === "object" ? { ...v, ...((s as Record<string, object>)[k] ?? {}) } : (s as Record<string, unknown>)[k] ?? v,
  ]));
  const p = receiptSettingsSchema.safeParse(merged);
  return p.success ? p.data : DEFAULT_RECEIPT_SETTINGS;
}

/** Colunas por linha: fonte A (médio/grande) 32 / 48; fonte B (pequeno) 42 / 64 — em 58 / 80 mm. */
export const columnsFor = (paper: PaperWidth, size: TextSize) => (size === "small" ? (paper === 58 ? 42 : 64) : paper === 58 ? 32 : 48);
/** Pontos de impressão por linha (203 dpi): 384 em 58 mm, 576 em 80 mm. */
export const dotsFor = (paper: PaperWidth) => (paper === 58 ? 384 : 576);
