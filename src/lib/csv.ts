/**
 * CSV seguro para Excel/Sheets: prefixo contra injeção de fórmulas (=, +, -, @) em texto vindo
 * de clientes (observações) ou do menu, ';' como separador (Excel em português) e BOM UTF-8.
 */
const SAFE = (v: string | number) => {
  if (typeof v === "number") return String(v);
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** `columns`: cabeçalho a usar quando não há linhas (um período sem dados dá um ficheiro com cabeçalho, não vazio). */
export function toCsv(rows: Record<string, string | number>[], columns?: string[]): string {
  const cols = rows.length ? Object.keys(rows[0]) : columns ?? [];
  if (!cols.length) return "﻿";
  return "﻿" + [cols.map(SAFE).join(";"), ...rows.map((r) => cols.map((c) => SAFE(r[c] ?? "")).join(";"))].join("\r\n") + "\r\n";
}
