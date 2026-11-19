/** Spreadsheet-safe cell, matching the live-poll export. */
export function spreadsheetCsvCell(value: string | number) {
  const text = String(value);
  const safe = /^(?:\s*[=+@-]|[^\S\t\r]*[\t\r])/u.test(text)
    ? `'${text}`
    : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
