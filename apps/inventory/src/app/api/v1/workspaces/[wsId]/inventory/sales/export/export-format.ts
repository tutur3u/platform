import type { InventorySalesExportRpcRow } from '@tuturuuu/inventory-core/sales-export';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { minorToMajor } from '@tuturuuu/utils/money';

export type InventorySalesExportFormat = 'csv' | 'xlsx';

export type NormalizedInventorySalesExportRow = Omit<
  InventorySalesExportRpcRow,
  'currency' | 'line_total' | 'monetary_unit' | 'sale_amount' | 'unit_price'
> & {
  currency: string;
  line_total: number | null;
  sale_amount: number;
  sale_timestamp: string | null;
  unit_price: number | null;
};

const SALE_COLUMNS = [
  ['Sale ID', 'sale_id'],
  ['Source', 'sale_source'],
  ['Period ID', 'period_id'],
  ['Period Name', 'period_name'],
  ['Sale Timestamp', 'sale_timestamp'],
  ['Created At', 'created_at'],
  ['Completed At', 'completed_at'],
  ['Sale Amount', 'sale_amount'],
  ['Currency', 'currency'],
  ['Customer Name', 'customer_name'],
  ['Customer Email', 'customer_email'],
  ['Creator Name', 'creator_name'],
  ['Wallet', 'wallet_name'],
  ['Category', 'category_name'],
  ['Notice', 'notice'],
  ['Note', 'note'],
  ['Transaction ID', 'transaction_id'],
  ['Finance Invoice ID', 'finance_invoice_id'],
  ['Public Token', 'public_token'],
  ['Checkout Provider', 'checkout_provider'],
  ['Polar Order ID', 'polar_order_id'],
  ['Square Order ID', 'square_order_id'],
] as const satisfies ReadonlyArray<
  readonly [string, keyof NormalizedInventorySalesExportRow]
>;

const LINE_COLUMNS = [
  ['Line ID', 'line_id'],
  ['Product ID', 'product_id'],
  ['Product Name', 'product_name'],
  ['Owner ID', 'owner_id'],
  ['Owner Name', 'owner_name'],
  ['Unit ID', 'unit_id'],
  ['Unit Name', 'unit_name'],
  ['Warehouse ID', 'warehouse_id'],
  ['Warehouse Name', 'warehouse_name'],
  ['Quantity', 'quantity'],
  ['Unit Price', 'unit_price'],
  ['Line Total', 'line_total'],
] as const satisfies ReadonlyArray<
  readonly [string, keyof NormalizedInventorySalesExportRow]
>;

function normalizeMoney(
  value: number | null,
  monetaryUnit: InventorySalesExportRpcRow['monetary_unit'],
  currency: string
) {
  if (value === null) return null;
  return monetaryUnit === 'minor' ? minorToMajor(value, currency) : value;
}

export function normalizeInventorySalesExportRows(
  rows: InventorySalesExportRpcRow[],
  workspaceCurrency: string
): NormalizedInventorySalesExportRow[] {
  return rows.map(({ monetary_unit: monetaryUnit, ...row }) => {
    const currency = row.currency || workspaceCurrency;
    return {
      ...row,
      currency,
      line_total: normalizeMoney(row.line_total, monetaryUnit, currency),
      sale_amount: normalizeMoney(row.sale_amount, monetaryUnit, currency) ?? 0,
      sale_timestamp: row.completed_at ?? row.created_at,
      unit_price: normalizeMoney(row.unit_price, monetaryUnit, currency),
    };
  });
}

function neutralizeSpreadsheetFormula(value: string) {
  const trimmedStart = value.trimStart();
  return /^[=+\-@]/u.test(trimmedStart) ? `'${value}` : value;
}

function cellValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string'
    ? neutralizeSpreadsheetFormula(value)
    : value;
}

function valuesForColumns(
  row: NormalizedInventorySalesExportRow,
  columns: typeof SALE_COLUMNS | typeof LINE_COLUMNS
) {
  return columns.map(([, key]) => cellValue(row[key]));
}

function csvCell(value: unknown) {
  return `"${String(cellValue(value)).replaceAll('"', '""')}"`;
}

export function buildInventorySalesCsv(
  rows: NormalizedInventorySalesExportRow[]
) {
  const header = [...SALE_COLUMNS, ...LINE_COLUMNS].map(([label]) => label);
  const dataRows = rows.map((row) => [
    ...valuesForColumns(row, SALE_COLUMNS),
    ...valuesForColumns(row, LINE_COLUMNS),
  ]);
  return `\uFEFF${[header, ...dataRows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}`;
}

export function buildInventorySalesWorkbook(
  rows: NormalizedInventorySalesExportRow[]
) {
  const sales = [
    ...new Map(
      rows.map((row) => [`${row.sale_source}:${row.sale_id}`, row])
    ).values(),
  ];
  const saleSheet = XLSX.utils.aoa_to_sheet([
    SALE_COLUMNS.map(([label]) => label),
    ...sales.map((row) => valuesForColumns(row, SALE_COLUMNS)),
  ]);
  const lineSheet = XLSX.utils.aoa_to_sheet([
    ['Sale ID', 'Source', 'Currency', ...LINE_COLUMNS.map(([label]) => label)],
    ...rows.map((row) => [
      cellValue(row.sale_id),
      cellValue(row.sale_source),
      cellValue(row.currency),
      ...valuesForColumns(row, LINE_COLUMNS),
    ]),
  ]);
  saleSheet['!cols'] = SALE_COLUMNS.map(() => ({ wch: 20 }));
  lineSheet['!cols'] = [
    { wch: 38 },
    { wch: 18 },
    { wch: 10 },
    ...LINE_COLUMNS.map(() => ({ wch: 20 })),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, saleSheet, 'Sales');
  XLSX.utils.book_append_sheet(workbook, lineSheet, 'Line Items');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

export function inventorySalesExportFilename(
  periodName: string,
  format: InventorySalesExportFormat
) {
  const slug =
    periodName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 80) || 'period';
  return `inventory-sales-${slug}.${format}`;
}
