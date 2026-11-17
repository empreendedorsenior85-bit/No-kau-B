/**
 * Codificador ESC/POS (Epson e compatíveis: Xprinter, Rongta, HPRT, Bixolon, Star em modo ESC/POS…).
 * Só comandos do conjunto base, suportados pela generalidade das impressoras térmicas de 58 e 80 mm.
 * Sem dependências: os bytes gerados são exatamente os que seguem para a impressora.
 */

export type Codepage = "cp860" | "cp850" | "ascii";
export const CODEPAGES: { id: Codepage; label: string }[] = [
  { id: "cp860", label: "PC860 — Português (recomendado)" },
  { id: "cp850", label: "PC850 — Multilingue" },
  { id: "ascii", label: "Sem acentos (impressoras básicas)" },
];
/** Número da tabela de caracteres no comando ESC t n (Epson). */
const CODEPAGE_N: Record<Codepage, number> = { cp860: 3, cp850: 2, ascii: 0 };

// Caracteres portugueses → byte em cada tabela (fonte: tabelas IBM CP860 e CP850).
const CP860: Record<string, number> = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ã": 0x84, "à": 0x85, "Á": 0x86, "ç": 0x87, "ê": 0x88, "Ê": 0x89, "è": 0x8a, "Í": 0x8b,
  "Ô": 0x8c, "ì": 0x8d, "Ã": 0x8e, "Â": 0x8f, "É": 0x90, "À": 0x91, "È": 0x92, "ô": 0x93, "õ": 0x94, "ò": 0x95, "Ú": 0x96, "ù": 0x97,
  "Ì": 0x98, "Õ": 0x99, "Ü": 0x9a, "Ù": 0x9d, "Ó": 0x9f, "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ª": 0xa6,
  "º": 0xa7, "Ò": 0xa9, "«": 0xae, "»": 0xaf, "·": 0xfa, "°": 0xf8,
};
const CP850: Record<string, number> = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "à": 0x85, "ç": 0x87, "ê": 0x88, "è": 0x8a, "ì": 0x8d, "É": 0x90, "ô": 0x93, "ò": 0x95,
  "ù": 0x97, "Ü": 0x9a, "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ª": 0xa6, "º": 0xa7, "«": 0xae, "»": 0xaf,
  "Á": 0xb5, "Â": 0xb6, "À": 0xb7, "ã": 0xc6, "Ã": 0xc7, "Ê": 0xd2, "È": 0xd4, "Í": 0xd6, "Ì": 0xde, "Ó": 0xe0, "Ô": 0xe2, "Ò": 0xe3,
  "õ": 0xe4, "Õ": 0xe5, "Ú": 0xe9, "Ù": 0xeb, "·": 0xfa, "°": 0xf8,
};
const TABLE: Record<Codepage, Record<string, number>> = { cp860: CP860, cp850: CP850, ascii: {} };

/** Texto → bytes na tabela escolhida. O que a tabela não tem perde o acento (nunca sai "?" no meio de um prato). */
export function encodeText(s: string, cp: Codepage): number[] {
  const out: number[] = [];
  const t = TABLE[cp];
  for (const ch of s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...").replace(/ | /g, " ")) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code < 0x7f) out.push(code);
    else if (t[ch] !== undefined) out.push(t[ch]);
    else {
      const base = ch.normalize("NFD").replace(/\p{Diacritic}/gu, "");
      out.push(...[...base].map((c) => (c.codePointAt(0)! < 0x7f && c.codePointAt(0)! >= 0x20 ? c.codePointAt(0)! : 0x3f)));
    }
  }
  return out;
}

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

/** Construtor de um talão. Larguras: 58 mm = 32 colunas, 80 mm = 48 colunas (fonte A). */
export class Receipt {
  private b: number[] = [];
  readonly cols: number;
  constructor(private readonly paper: 58 | 80, private readonly cp: Codepage) {
    this.cols = paper === 58 ? 32 : 48;
    this.b.push(ESC, 0x40); // ESC @ — inicializar
    this.b.push(ESC, 0x74, CODEPAGE_N[cp]); // ESC t n — tabela de caracteres
  }
  align(a: "left" | "center" | "right") { this.b.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2); return this; }
  bold(on: boolean) { this.b.push(ESC, 0x45, on ? 1 : 0); return this; }
  /** GS ! n — tamanho (1 = normal, 2 = dobro). */
  size(w: 1 | 2, h: 1 | 2) { this.b.push(GS, 0x21, ((w - 1) << 4) | (h - 1)); return this; }
  text(s: string) { this.b.push(...encodeText(s, this.cp)); return this; }
  line(s = "") { return this.text(s).feed(1); }
  feed(n = 1) { for (let i = 0; i < n; i++) this.b.push(LF); return this; }
  rule(ch = "-") { return this.line(ch.repeat(this.cols)); }
  /** Duas colunas: texto à esquerda (com quebra) e valor encostado à direita. */
  row(left: string, right: string, width = this.cols) {
    const room = Math.max(4, width - right.length - 1);
    const words = left.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur ? cur.length + 1 : 0) + w.length <= room) cur = cur ? `${cur} ${w}` : w;
      else { if (cur) lines.push(cur); cur = w.length > room ? w.slice(0, room) : w; }
    }
    if (cur) lines.push(cur);
    lines.forEach((l, i) => this.line(i === lines.length - 1 ? `${l}${" ".repeat(Math.max(1, width - l.length - right.length))}${right}` : l));
    return this;
  }
  /** Quebra de linha simples (observações, rodapé). */
  wrap(s: string, indent = "") {
    const width = this.cols - indent.length;
    let cur = "";
    for (const w of s.split(/\s+/)) {
      if ((cur ? cur.length + 1 : 0) + w.length <= width) cur = cur ? `${cur} ${w}` : w;
      else { if (cur) this.line(indent + cur); cur = w.slice(0, width); }
    }
    if (cur) this.line(indent + cur);
    return this;
  }
  /** Avança o papel e corta (GS V 66 3: corte parcial depois de alimentar 3 linhas). Impressoras sem guilhotina ignoram. */
  cut() { this.b.push(GS, 0x56, 66, 3); return this; }
  /** Abrir gaveta de dinheiro (ESC p 0) — não usado por defeito. */
  bytes(): Buffer { return Buffer.from(this.b); }
}

export type TicketData = {
  station: "kitchen" | "counter";
  printerName: string;
  restaurant: string;
  tableLabel: string;
  orderNumber: string;
  createdAt: string;
  acceptedBy: string | null;
  items: { name: string; quantity: number; unitPrice: number; note: string | null }[];
  total: number;
  reprint: boolean;
  isTest: boolean;
};

const fcfa = (n: number) => `${new Intl.NumberFormat("pt-PT", { useGrouping: "always", maximumFractionDigits: 0 }).format(n).replace(/\s/g, " ")} FCFA`;
const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

/** Talão de pedido: mesa e número em destaque, produtos, quantidades, preços, observações e total. */
export function orderTicket(d: TicketData, paper: 58 | 80, cp: Codepage): Buffer {
  const r = new Receipt(paper, cp);
  r.align("center").bold(true).size(2, 2).line(d.restaurant.toUpperCase()).size(1, 1).bold(false);
  r.line(d.station === "kitchen" ? "*** COZINHA ***" : "*** BALCAO / BAR ***");
  if (d.reprint) r.bold(true).line("*** REIMPRESSAO ***").bold(false);
  if (d.isTest) r.bold(true).line("PEDIDO DE TESTE (demonstracao)").bold(false);
  r.feed(1).bold(true).size(2, 2).line(d.tableLabel).size(1, 1).line(`Pedido ${d.orderNumber}`).bold(false);
  r.line(when(d.createdAt));
  if (d.acceptedBy) r.line(`Aceite por: ${d.acceptedBy}`);
  r.align("left").rule();
  for (const it of d.items) {
    r.bold(true).row(`${it.quantity}x ${it.name}`, fcfa(it.unitPrice * it.quantity)).bold(false);
    if (it.quantity > 1) r.line(`   (${fcfa(it.unitPrice)} cada)`);
    if (it.note) r.bold(true).wrap(`>> ${it.note}`, "   ").bold(false);
  }
  r.rule();
  r.bold(true).size(1, 2).row("TOTAL", fcfa(d.total)).size(1, 1).bold(false);
  r.feed(1).align("center").line(`${d.printerName}`).feed(2).cut();
  return r.bytes();
}

/** Talão de teste de impressão: confirma ligação, largura, acentos e corte. */
export function testTicket(printerName: string, paper: 58 | 80, cp: Codepage, connection: string): Buffer {
  const r = new Receipt(paper, cp);
  r.align("center").bold(true).size(2, 2).line("NO KAU").size(1, 1).line("TESTE DE IMPRESSAO").bold(false).feed(1);
  r.align("left").line(`Impressora: ${printerName}`).line(`Ligacao: ${connection}`).line(`Papel: ${paper} mm (${r.cols} colunas)`);
  r.line(`Tabela: ${cp.toUpperCase()}`).line(`Data: ${when(new Date().toISOString())}`).rule();
  r.line("Acentos: Nô Kau · Camarão · Ação · Pão").line("Maiúsculas: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç");
  r.line("1".repeat(r.cols)).line("Se a linha acima ocupa a largura toda,");
  r.line("a largura do papel esta certa.").rule().align("center").line("Fim do teste").feed(2).cut();
  return r.bytes();
}
