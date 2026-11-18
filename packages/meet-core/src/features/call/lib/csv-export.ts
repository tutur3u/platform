export type CsvCell = string | number | boolean | null | undefined;

const formulaPrefix = /^[\s\p{Cc}\p{Cf}]*[=+@\t\r-]/u;
const windowsDeviceName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const maxFilenameStemBytes = 116;

export function escapeCsvCell(cell: CsvCell): string {
  const value = cell == null ? '' : String(cell);
  // Quoting a CSV field does not prevent spreadsheets from evaluating it.
  const safeValue = formulaPrefix.test(value) ? "'".concat(value) : value;

  return /[",\r\n]/.test(safeValue)
    ? '"'.concat(safeValue.replaceAll('"', '""'), '"')
    : safeValue;
}

/** Serialize rectangular records, including any untrusted header cells. */
export function buildSafeCsv(rows: readonly (readonly CsvCell[])[]): string {
  const columnCount = rows[0]?.length;

  return rows
    .map((row) => {
      if (row.length === 0 || row.length !== columnCount) {
        throw new RangeError('CSV records must have the same nonzero width');
      }

      const record = row.map(escapeCsvCell).join(',');
      return record === '' ? '""' : record;
    })
    .join('\r\n');
}

/** Blank the caller's identity columns while keeping the export schema stable. */
export function projectSafeExportRow(
  row: Readonly<Record<string, CsvCell>>,
  {
    anonymous,
    identityColumns,
  }: { anonymous: boolean; identityColumns: readonly string[] }
): Record<string, CsvCell> {
  const redacted = new Set(anonymous ? identityColumns : []);

  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      redacted.has(column) ? '' : value,
    ])
  );
}

/** Produce a portable leaf filename with a single final .csv extension. */
export function sanitizeExportFilename(filename: string): string {
  const stem = filename
    .normalize('NFKC')
    .trim()
    .replace(/\.csv$/i, '')
    .replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  const portableStem = windowsDeviceName.test(stem) ? '_'.concat(stem) : stem;
  const encoder = new TextEncoder();
  let boundedStem = '';
  let bytes = 0;
  for (const character of portableStem) {
    bytes += encoder.encode(character).length;
    if (bytes > maxFilenameStemBytes) break;
    boundedStem += character;
  }

  return (boundedStem.replace(/\.+$/, '') || 'export').concat('.csv');
}
