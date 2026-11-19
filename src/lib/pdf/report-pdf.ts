import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportRow } from "@/lib/stats";
import { site } from "@/lib/site";

/**
 * Relatório em PDF (A4), gerado no servidor a partir dos MESMOS dados da página Relatórios.
 * Fonte padrão (Helvetica, WinAnsi): cobre o português (á, ã, ç, ô…); caracteres fora da tabela são trocados.
 */
export type PdfSection = { title: string; sub?: string; rows: ReportRow[]; sum?: string[]; empty: string };
export type PdfReport = {
  periodLabel: string; generatedBy: string; includeTest: boolean;
  /** Logótipo do Nô Kau (PNG), no cabeçalho de cada página. */
  logoPng?: Uint8Array | null;
  kpis: { label: string; value: string }[];
  sections: PdfSection[];
};

const A4 = { w: 595.28, h: 841.89 };
const M = 40; // margem
const GOLD = rgb(0.66, 0.53, 0.17), INK = rgb(0.1, 0.09, 0.07), MUTED = rgb(0.42, 0.39, 0.34), LINE = rgb(0.85, 0.82, 0.76), ZEBRA = rgb(0.97, 0.96, 0.93);
const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0, useGrouping: "always" });

export async function buildReportPdf(r: PdfReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${site.name} — Relatório ${r.periodLabel}`);
  doc.setAuthor(site.name); doc.setCreator(`${site.name} — painel de gestão`); doc.setProducer("pdf-lib");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = r.logoPng ? await doc.embedPng(r.logoPng).catch(() => null) : null;

  // texto seguro para WinAnsi (espaços finos do Intl → espaço normal; o resto que não exista → "?")
  const ok = new Map<string, boolean>();
  const safe = (s: string) => [...s.replace(/[   ]/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-")]
    .map((ch) => { if (!ok.has(ch)) { try { font.encodeText(ch); ok.set(ch, true); } catch { ok.set(ch, false); } } return ok.get(ch) ? ch : "?"; }).join("");
  const width = (s: string, f: PDFFont, size: number) => f.widthOfTextAtSize(safe(s), size);
  const fit = (s: string, f: PDFFont, size: number, max: number) => {
    let t = safe(s);
    if (f.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
    return `${t}...`;
  };
  const cell = (v: string | number) => (typeof v === "number" ? nf.format(v) : String(v ?? ""));

  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = font, color = INK) => page.drawText(safe(s), { x, y: yy, size, font: f, color });
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - M;
    // cabeçalho de cada página (com o logótipo do Nô Kau, se existir)
    let x0 = M;
    if (logo) {
      const h = 34, w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: M, y: y - h + 6, width: w, height: h });
      x0 = M + w + 10;
      y -= 12;
    }
    text(site.name, x0, y - 12, 16, bold, INK);
    text("Relatório de vendas", x0 + width(site.name, bold, 16) + 10, y - 12, 11, font, MUTED);
    const right = `Período: ${r.periodLabel}${r.includeTest ? " (inclui testes)" : ""}`;
    text(right, A4.w - M - width(right, font, 9), y - 10, 9, font, MUTED);
    y -= 22;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1.2, color: GOLD });
    y -= 16;
  };
  const need = (h: number) => { if (y - h < M + 20) newPage(); };

  newPage();
  // dados do documento
  const when = new Date().toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Bissau" });
  text(`${site.address} · ${site.phoneDisplay}`, M, y, 9, font, MUTED); y -= 12;
  text(`Gerado em ${when} (hora da Guiné-Bissau) por ${r.generatedBy}. Vendas = pedidos concluídos ou pagos.`, M, y, 9, font, MUTED); y -= 20;

  // indicadores
  if (r.kpis.length) {
    const cols = Math.min(r.kpis.length, 3), gap = 8;
    const bw = (A4.w - 2 * M - gap * (cols - 1)) / cols, bh = 46;
    r.kpis.forEach((k, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) y -= bh + gap;
      if (col === 0) need(bh + 4);
      const x = M + col * (bw + gap);
      page.drawRectangle({ x, y: y - bh, width: bw, height: bh, color: ZEBRA, borderColor: LINE, borderWidth: 0.8 });
      text(k.label.toUpperCase(), x + 10, y - 15, 7.5, font, MUTED);
      text(fit(k.value, bold, 15, bw - 20), x + 10, y - 35, 15, bold, INK);
    });
    y -= bh + 22;
  }

  // tabelas
  for (const s of r.sections) {
    need(60);
    text(s.title, M, y, 13, bold, INK); y -= 13;
    if (s.sub) { text(s.sub, M, y, 8.5, font, MUTED); y -= 12; }
    y -= 4;
    if (!s.rows.length) { text(s.empty, M, y - 10, 9, font, MUTED); y -= 28; continue; }
    const cols = Object.keys(s.rows[0]);
    // colunas de números: largura do cabeçalho ou do maior valor (o que for maior); a primeira fica com o resto
    const tableW = A4.w - 2 * M;
    const numW = cols.slice(1).map((c) => Math.max(48, width(c, bold, 8) + 10, ...s.rows.map((row) => width(cell(row[c]), font, 8.5) + 10)));
    const firstW = Math.max(110, tableW - numW.reduce((a, b) => a + b, 0));
    const scale = numW.length ? Math.min(1, (tableW - firstW) / numW.reduce((a, b) => a + b, 0)) : 1;
    const colW = [firstW, ...numW.map((w) => w * scale)];
    const rowH = 15;
    const header = () => {
      need(rowH * 2);
      page.drawRectangle({ x: M, y: y - rowH + 4, width: tableW, height: rowH, color: INK });
      let x = M;
      cols.forEach((c, i) => {
        const t = fit(c, bold, 8, colW[i] - 8);
        text(t, i === 0 ? x + 4 : x + colW[i] - 4 - width(t, bold, 8), y - 7, 8, bold, rgb(1, 1, 1));
        x += colW[i];
      });
      y -= rowH;
    };
    header();
    const totals: Record<string, number> = {};
    for (const c of s.sum ?? []) totals[c] = s.rows.reduce((a, row) => a + Number(row[c] ?? 0), 0);
    s.rows.forEach((row, ri) => {
      if (y - rowH < M + 20) { newPage(); header(); }
      if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 4, width: tableW, height: rowH, color: ZEBRA });
      let x = M;
      cols.forEach((c, i) => {
        const t = fit(cell(row[c]), font, 8.5, colW[i] - 8);
        text(t, i === 0 ? x + 4 : x + colW[i] - 4 - width(t, font, 8.5), y - 7, 8.5);
        x += colW[i];
      });
      y -= rowH;
    });
    if (s.sum?.length) {
      if (y - rowH < M + 20) { newPage(); header(); }
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + tableW, y: y + 4 }, thickness: 0.8, color: GOLD });
      let x = M;
      cols.forEach((c, i) => {
        const t = i === 0 ? "Total" : c in totals ? nf.format(totals[c]) : "";
        text(t, i === 0 ? x + 4 : x + colW[i] - 4 - width(t, bold, 8.5), y - 7, 8.5, bold);
        x += colW[i];
      });
      y -= rowH;
    }
    y -= 18;
  }

  // rodapé com numeração
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Página ${i + 1} de ${pages.length}`;
    p.drawText(label, { x: A4.w - M - font.widthOfTextAtSize(label, 8), y: M - 16, size: 8, font, color: MUTED });
    p.drawText(safe(`${site.name} — documento interno de gestão`), { x: M, y: M - 16, size: 8, font, color: MUTED });
  });
  return doc.save();
}
