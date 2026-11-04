import { XLSX } from '@tuturuuu/ui/xlsx';
import { sanitizeSpreadsheetText } from '@tuturuuu/utils/spreadsheet-text';
import type { FeeLockExportCell, FeeLockExportSheets } from './export-rows';

export const FEE_LOCK_EXPORT_MAX_ROWS = 2000;
export const FEE_LOCK_EXPORT_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Selene gate (2): every text cell is an explicit STRING cell (t: 's', never
// `f`), passed through sanitizeSpreadsheetText, so =HYPERLINK(...) stays text.
// Amounts and counts are numeric cells; null is an empty cell.
function toCell(value: FeeLockExportCell): XLSX.CellObject | null {
  if (value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { t: 'n', v: value } : null;
  }
  return { t: 's', v: sanitizeSpreadsheetText(value) };
}

function toSheet(rows: FeeLockExportCell[][]): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  let maxColumn = 0;
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      const cell = toCell(value);
      if (cell) sheet[XLSX.utils.encode_cell({ r, c })] = cell;
    });
    maxColumn = Math.max(maxColumn, row.length - 1);
  });
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(rows.length - 1, 0), c: maxColumn },
  });
  return sheet;
}

/** The .xlsx bytes for both sheets. Built on the server, never stored. */
export function writeFeeLockWorkbook(
  sheets: FeeLockExportSheets
): Uint8Array<ArrayBuffer> {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    toSheet(sheets.summary),
    sheets.summaryName
  );
  XLSX.utils.book_append_sheet(
    workbook,
    toSheet(sheets.detail),
    sheets.detailName
  );
  const bytes: ArrayBuffer = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    compression: true,
  });
  return new Uint8Array(bytes);
}

/** Lower-case hex SHA-256 of the exact bytes sent, for the `exported` event. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

/**
 * `chot-hoc-phi-2026-12-1a2b3c4d.xlsx`: a validated month plus the first 8
 * hex digits of the workspace id. It never contains user text; anything else
 * throws.
 */
export function feeLockExportFileName(month: string, wsId: string) {
  const ws = wsId.replace(/-/g, '').slice(0, 8).toLowerCase();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^[0-9a-f]{8}$/.test(ws)) {
    throw new Error('Invalid fee-lock export file name');
  }
  return `chot-hoc-phi-${month}-${ws}.xlsx`;
}
