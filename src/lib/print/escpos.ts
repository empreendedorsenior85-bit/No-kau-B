/**
 * Codificador ESC/POS (Epson e compatíveis: Xprinter, Rongta, HPRT, Bixolon, Star em modo ESC/POS…).
 * Só comandos do conjunto base, suportados pela generalidade das impressoras térmicas de 58 e 80 mm.
 * Sem dependências: os bytes gerados são exatamente os que seguem para a impressora.
 */

import QRCode from "qrcode";
import type { Doc } from "@/lib/receipt/doc";
import { rowLines, wrapText } from "@/lib/receipt/doc";
import { dotsFor } from "@/lib/receipt/settings";

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

const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Bissau" });

/** Talão de teste de impressão: confirma ligação, largura, acentos e corte. */
export function testTicket(printerName: string, paper: 58 | 80, cp: Codepage, connection: string): Buffer {
  const r = new Receipt(paper, cp);
  r.align("center").bold(true).size(2, 2).line("NO KAU").size(1, 1).line("TESTE DE IMPRESSAO").bold(false).feed(1);
  // todas as linhas cabem na largura do papel (58 mm = 32 colunas): as mais longas são divididas por palavras
  r.align("left").wrap(`Impressora: ${printerName}`).wrap(`Ligacao: ${connection}`).wrap(`Papel: ${paper} mm (${r.cols} colunas)`);
  r.wrap(`Tabela: ${cp.toUpperCase()}`).wrap(`Data: ${when(new Date().toISOString())}`).rule();
  r.wrap("Acentos: Nô Kau · Camarão · Ação · Pão").wrap("Maiúsculas: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç");
  r.line("1".repeat(r.cols)).wrap("Se a linha acima ocupa a largura toda, a largura do papel esta certa.");
  r.rule().align("center").line("Fim do teste").feed(2).cut();
  return r.bytes();
}

// ======================================================================================================
// Recibos e talões personalizados: a descrição (Doc) é a mesma da pré-visualização e do recibo no ecrã.
// ======================================================================================================

export type Bitmap = { width: number; height: number; data: Buffer }; // 1 bit por ponto, 1 = preto

/** QR Code como imagem (funciona em qualquer impressora com imagens, ao contrário do comando QR nativo). */
export function qrBitmap(text: string, maxDots: number): Bitmap {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size, quiet = 2;
  const scale = Math.max(2, Math.min(8, Math.floor(maxDots / (n + quiet * 2))));
  const w = (n + quiet * 2) * scale;
  const bpr = Math.ceil(w / 8);
  const data = Buffer.alloc(bpr * w);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!q.modules.data[y * n + x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const px = (x + quiet) * scale + dx, py = (y + quiet) * scale + dy;
      data[py * bpr + (px >> 3)] |= 0x80 >> (px & 7);
    }
  }
  return { width: w, height: w, data };
}

/** GS v 0 — imagem rasterizada (o comando de imagem mais suportado). Em blocos de 255 linhas. */
function raster(img: Bitmap): number[] {
  const out: number[] = [];
  const bpr = Math.ceil(img.width / 8);
  for (let y0 = 0; y0 < img.height; y0 += 255) {
    const h = Math.min(255, img.height - y0);
    out.push(GS, 0x76, 0x30, 0, bpr & 0xff, bpr >> 8, h & 0xff, h >> 8);
    for (const b of img.data.subarray(y0 * bpr, (y0 + h) * bpr)) out.push(b);
  }
  return out;
}

/**
 * Bytes ESC/POS de um recibo/talão. Tamanho do texto: pequeno = fonte B (mais colunas), médio = fonte A,
 * grande = fonte A em dupla altura. Destaques ("big") em dupla largura+altura (metade das colunas).
 */
export function renderDoc(doc: Doc, cp: Codepage, logo: Bitmap | null): Buffer {
  const b: number[] = [ESC, 0x40, ESC, 0x74, CODEPAGE_N[cp]];
  const font = doc.textSize === "small" ? 1 : 0;
  const base = doc.textSize === "large" ? 0x01 : 0x00; // GS ! — dupla altura no tamanho grande
  b.push(ESC, 0x4d, font, GS, 0x21, base);
  const enc = (s: string) => encodeText(s, cp);
  const line = (s: string) => { b.push(...enc(s), LF); };
  const align = (a: "left" | "center" | "right" = "left") => b.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  const bold = (on: boolean) => b.push(ESC, 0x45, on ? 1 : 0);
  const big = (on: boolean) => b.push(GS, 0x21, on ? 0x11 : base);
  for (const k of doc.blocks) {
    if (k.t === "text") {
      const cols = k.big ? Math.floor(doc.cols / 2) : doc.cols;
      align(k.align); if (k.bold) bold(true); if (k.big) big(true);
      for (const l of wrapText(k.text, cols)) line(l);
      if (k.big) big(false); if (k.bold) bold(false);
    } else if (k.t === "row") {
      const cols = k.big ? Math.floor(doc.cols / 2) : doc.cols;
      align("left"); if (k.bold) bold(true); if (k.big) big(true);
      for (const l of rowLines(k.left, k.right, cols)) line(l);
      if (k.big) big(false); if (k.bold) bold(false);
    } else if (k.t === "rule") { align("left"); line((k.char ?? "-").repeat(doc.cols)); }
    else if (k.t === "feed") { for (let i = 0; i < (k.n ?? 1); i++) b.push(LF); }
    else if (k.t === "logo") { if (logo) { align("center"); b.push(...raster(logo), LF); } }
    else if (k.t === "qr") { align("center"); b.push(...raster(qrBitmap(k.data, Math.round(dotsFor(doc.paper) * 0.45))), LF); }
    else if (k.t === "cut") b.push(GS, 0x56, 66, 3);
  }
  return Buffer.from(b);
}
