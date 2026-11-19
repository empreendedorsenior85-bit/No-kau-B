import QRCode from "qrcode";
import type { CSSProperties, ReactNode } from "react";
import { rowLines, wrapText, type Doc } from "@/lib/receipt/doc";

/**
 * Representação fiel de um talão térmico: a mesma descrição (Doc) que gera os bytes ESC/POS, com as mesmas colunas
 * por linha (58/80 mm, fonte A/B), dupla altura no tamanho grande, logótipo e QR Code. Funciona no servidor e no navegador.
 */
const PAPER_PX = { 58: 300, 80: 410 } as const; // largura útil desenhada (proporcional: 48 mm / 72 mm de impressão)

function QrSvg({ data }: { data: string }) {
  const q = QRCode.create(data, { errorCorrectionLevel: "M" });
  const n = q.modules.size, quiet = 2, total = n + quiet * 2;
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.data[y * n + x]) cells.push(<rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width={1.02} height={1.02} />);
  return (
    <svg data-testid="receipt-qr" role="img" aria-label={`QR Code: ${data}`} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" style={{ display: "block", margin: "4px auto", width: "45%", height: "auto" }}>
      <rect width={total} height={total} fill="#fff" /><g fill="#000">{cells}</g>
    </svg>
  );
}

export function ThermalPaper({ doc, logoUrl, testId }: { doc: Doc; logoUrl: string | null; testId?: string }) {
  const max = PAPER_PX[doc.paper];
  // tudo relativo à largura do papel (unidades de contentor): encolhe no telemóvel mantendo as mesmas colunas por linha
  const u = (k: number) => `calc(100cqw / ${doc.cols} / 0.6 * ${k})`; // 1 = tamanho da letra normal
  const tall = doc.textSize === "large"; // dupla altura (como GS ! 0x01)
  const lines: ReactNode[] = [];
  let k = 0;
  const style = (o: { bold?: boolean; big?: boolean; align?: string }): CSSProperties => {
    const base: CSSProperties = { whiteSpace: "pre", overflow: "hidden", fontWeight: o.bold ? 700 : 400, textAlign: (o.align ?? "left") as CSSProperties["textAlign"] };
    if (o.big) return { ...base, fontSize: u(2), lineHeight: u(2.5), height: u(2.5) }; // dupla largura e altura
    if (tall) return { ...base, fontSize: u(1), lineHeight: u(1.25), height: u(2.5), transform: "scaleY(2)", transformOrigin: "top" };
    return { ...base, fontSize: u(1), lineHeight: u(1.25), height: u(1.25) };
  };
  const line = (text: string, o: { align?: string; bold?: boolean; big?: boolean; id?: string; first?: boolean }) =>
    lines.push(<div key={k++} style={style(o)} data-testid={o.first ? o.id : undefined}>{text || " "}</div>);
  for (const b of doc.blocks) {
    if (b.t === "text") {
      const cols = b.big ? Math.floor(doc.cols / 2) : doc.cols;
      wrapText(b.text, cols).forEach((l, i) => line(l, { align: b.align, bold: b.bold, big: b.big, id: b.id, first: i === 0 }));
    } else if (b.t === "row") {
      const cols = b.big ? Math.floor(doc.cols / 2) : doc.cols;
      // o identificador fica no bloco inteiro (para ler o valor da linha)
      lines.push(<div key={k++} data-testid={b.id}>{rowLines(b.left, b.right, cols).map((l, i) => <div key={i} style={style({ bold: b.bold, big: b.big })}>{l}</div>)}</div>);
    } else if (b.t === "rule") line((b.char ?? "-").repeat(doc.cols), {});
    else if (b.t === "feed") for (let i = 0; i < (b.n ?? 1); i++) line("", {});
    else if (b.t === "logo") {
      // eslint-disable-next-line @next/next/no-img-element
      if (logoUrl) lines.push(<img key={k++} src={logoUrl} alt="Logótipo" data-testid="receipt-logo" style={{ display: "block", margin: "4px auto", maxWidth: "60%", maxHeight: 140, filter: "grayscale(1) contrast(1.4)" }} />);
    } else if (b.t === "qr") lines.push(<QrSvg key={k++} data={b.data} />);
    else if (b.t === "cut") lines.push(<div key={k++} aria-hidden style={{ borderTop: "2px dashed #bbb", margin: "10px -12px 0" }} title="Corte do papel" />);
  }
  return (
    <div data-testid={testId} data-paper={doc.paper} data-text-size={doc.textSize} data-cols={doc.cols}
      className="thermal-paper mx-auto overflow-hidden rounded-md bg-white text-black shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] print:shadow-none"
      style={{ width: `min(100%, ${max + 24}px)`, containerType: "inline-size", padding: "14px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" }}>
      {lines}
    </div>
  );
}
