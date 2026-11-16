/**
 * CSV seguro para Excel/Sheets: prefixo contra injeção de fórmulas (=, +, -, @) em texto vindo
 * de clientes (observações) ou do menu, ';' como separador (Excel em português) e BOM UTF-8.
 */
const SAFE = (v: string | number) => {
  if (typeof v === "number") return String(v);
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "﻿";
  const cols = Object.keys(rows[0]);
  return "﻿" + [cols.map(SAFE).join(";"), ...rows.map((r) => cols.map((c) => SAFE(r[c] ?? "")).join(";"))].join("\r\n") + "\r\n";
}
