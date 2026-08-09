/** RFC-4180 quoting: wrap in quotes and escape embedded quotes whenever a field
 * contains a comma, quote, or newline. Leaving plain fields unquoted keeps the output
 * readable, which matters since this is also a human-inspectable data export. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => csvField(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvField(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

/** Same blob-download trick as downloadPdf() in src/lib/pdf/proposal.ts — works
 * without any Tauri fs/dialog plugin since WebView2/WKWebView treat a `download`-
 * attribute anchor click as a browser download. A UTF-8 BOM is prefixed so Excel
 * (which otherwise guesses the system codepage) reads accented characters correctly. */
export function downloadCsv(filename: string, columns: { key: string; label: string }[], rows: Record<string, unknown>[]): void {
  const csv = toCsv(columns, rows);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
