/**
 * Minimal CSV reader/writer (RFC 4180): quoted fields, doubled quotes, commas and line breaks
 * inside quotes, BOM. Enough for the SIGE spreadsheets without adding a dependency.
 */

export interface CsvParsed {
  headers: string[];
  /** One object per data row, keyed by the header text as written in the file. */
  rows: Record<string, string>[];
}

/** Splits CSV text into rows of fields. Blank lines are skipped. */
export function parseCsvRows(text: string, delimiter = ","): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error("Aspas sem fechamento no CSV.");
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** First row = headers. Fails on duplicated headers or rows with extra columns. */
export function parseCsv(text: string, delimiter = ","): CsvParsed {
  const [headerRow, ...body] = parseCsvRows(text, delimiter);
  if (!headerRow) return { headers: [], rows: [] };
  const headers = headerRow.map((h) => h.trim());
  const seen = new Set<string>();
  for (const h of headers) {
    const key = h.toLowerCase();
    if (seen.has(key)) throw new Error(`Cabeçalho duplicado no CSV: ${h}`);
    seen.add(key);
  }
  const rows = body.map((fields, i) => {
    if (fields.length > headers.length) {
      throw new Error(`Linha ${i + 2}: mais colunas que o cabeçalho.`);
    }
    const out: Record<string, string> = {};
    headers.forEach((h, j) => {
      out[h] = fields[j] ?? "";
    });
    return out;
  });
  return { headers, rows };
}

/** Escapes one value; values starting with = + - @ get a leading ' so spreadsheets don't run them. */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with BOM (Excel opens it with the right accents). */
export function toCsv<T extends object>(rows: T[], headers?: (keyof T & string)[]): string {
  const cols: string[] = headers ?? Object.keys(rows[0] ?? {});
  const lines = [
    cols.map(cell).join(","),
    ...rows.map((r) => cols.map((c) => cell((r as Record<string, unknown>)[c])).join(",")),
  ];
  return `﻿${lines.join("\r\n")}`;
}
