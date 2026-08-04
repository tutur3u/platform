import type { InventorySalesExportRpcRow } from '@tuturuuu/inventory-core/sales-export';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { minorToMajor } from '@tuturuuu/utils/money';
import {
  CSV_TECHNICAL_COLUMNS,
  type NormalizedInventorySalesExportRow,
  type ProductSummaryRow,
  READABLE_COLUMN_WIDTHS,
  READABLE_COLUMNS,
  type ReadableInventorySalesExportRow,
  SUMMARY_COLUMNS,
  TECHNICAL_COLUMNS,
} from './export-schema';

export type { NormalizedInventorySalesExportRow } from './export-schema';

export type InventorySalesExportFormat = 'csv' | 'xlsx';

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

function valuesForColumns<
  Row extends Record<string, unknown>,
  Key extends keyof Row,
>(row: Row, columns: ReadonlyArray<readonly [string, Key]>) {
  return columns.map(([, key]) => cellValue(row[key]));
}

function titleCaseIdentifier(value: string) {
  return value
    .trim()
    .split(/[_\-\s]+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function salesChannel(row: NormalizedInventorySalesExportRow) {
  if (row.sale_source === 'finance_invoice') return 'Finance Invoice';
  switch (row.checkout_provider) {
    case 'cash':
      return 'Cash';
    case 'polar':
      return 'Polar';
    case 'square_pos':
      return 'Square POS';
    case 'square_terminal':
      return 'Square Terminal';
    case null:
      return 'Checkout';
    default:
      return titleCaseIdentifier(row.checkout_provider);
  }
}

function readableRow(
  row: NormalizedInventorySalesExportRow
): ReadableInventorySalesExportRow {
  const reference = row.public_token?.trim() || row.sale_id;
  return {
    creator: row.creator_name ?? '',
    currency: row.currency,
    customer_email: row.customer_email ?? '',
    customer_name: row.customer_name ?? '',
    item_category: row.product_category_name?.trim() || 'Uncategorized',
    item_name: row.product_name?.trim() || 'Unnamed item',
    line_total: row.line_total,
    note: row.note ?? '',
    notice: row.notice ?? '',
    owner: row.owner_name?.trim() || 'Unassigned',
    quantity: row.quantity,
    sale_reference: reference.slice(0, 8).toUpperCase(),
    sales_channel: salesChannel(row),
    sold_at: row.sale_timestamp,
    transaction_category: row.category_name?.trim() || 'Unassigned',
    unit: row.unit_name?.trim() || 'Unassigned',
    unit_price: row.unit_price,
    wallet: row.wallet_name ?? '',
    warehouse: row.warehouse_name?.trim() || 'Unassigned',
  };
}

function sortedRows(rows: NormalizedInventorySalesExportRow[]) {
  return [...rows].sort((left, right) => {
    const dateComparison = (right.sale_timestamp ?? '').localeCompare(
      left.sale_timestamp ?? ''
    );
    if (dateComparison !== 0) return dateComparison;
    const saleComparison = left.sale_id.localeCompare(right.sale_id);
    if (saleComparison !== 0) return saleComparison;
    return (left.product_name ?? '').localeCompare(right.product_name ?? '');
  });
}

function productSummary(rows: NormalizedInventorySalesExportRow[]) {
  const grouped = new Map<
    string,
    ProductSummaryRow & { saleIds: Set<string> }
  >();

  for (const row of rows) {
    if (!row.product_id && !row.product_name) continue;
    const readable = readableRow(row);
    const key = JSON.stringify([
      readable.item_category,
      readable.item_name,
      readable.owner,
      readable.unit,
      readable.currency,
    ]);
    const current = grouped.get(key) ?? {
      average_unit_price: null,
      currency: readable.currency,
      item_category: readable.item_category,
      item_name: readable.item_name,
      owner: readable.owner,
      quantity_sold: 0,
      revenue: 0,
      saleIds: new Set<string>(),
      sales_count: 0,
      unit: readable.unit,
    };
    current.quantity_sold += row.quantity ?? 0;
    current.revenue += row.line_total ?? 0;
    current.saleIds.add(`${row.sale_source}:${row.sale_id}`);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map(({ saleIds, ...row }) => ({
      ...row,
      average_unit_price:
        row.quantity_sold === 0 ? null : row.revenue / row.quantity_sold,
      sales_count: saleIds.size,
    }))
    .sort(
      (left, right) =>
        left.item_category.localeCompare(right.item_category) ||
        left.item_name.localeCompare(right.item_name) ||
        left.owner.localeCompare(right.owner) ||
        left.currency.localeCompare(right.currency)
    );
}

function csvCell(value: unknown) {
  return `"${String(cellValue(value)).replaceAll('"', '""')}"`;
}

export function buildInventorySalesCsv(
  rows: NormalizedInventorySalesExportRow[]
) {
  const header = [...READABLE_COLUMNS, ...CSV_TECHNICAL_COLUMNS].map(
    ([label]) => label
  );
  const dataRows = sortedRows(rows).map((row) => [
    ...valuesForColumns(readableRow(row), READABLE_COLUMNS),
    ...valuesForColumns(row, CSV_TECHNICAL_COLUMNS),
  ]);
  return `\uFEFF${[header, ...dataRows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}`;
}

function toUtcDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function setSheetLayout(
  sheet: XLSX.WorkSheet,
  widths: number[],
  numericColumns: number[],
  dateColumns: number[] = []
) {
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  if (!range) return;

  for (let row = 1; row <= range.e.r; row += 1) {
    for (const column of numericColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ c: column, r: row })];
      if (cell) cell.z = '#,##0.00########';
    }
    for (const column of dateColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ c: column, r: row })];
      if (cell) cell.z = 'yyyy-mm-dd hh:mm "UTC"';
    }
  }
}

export function buildInventorySalesWorkbook(
  rows: NormalizedInventorySalesExportRow[]
) {
  const orderedRows = sortedRows(rows);
  const details = orderedRows.map(readableRow);
  const summary = productSummary(orderedRows);
  const detailSheet = XLSX.utils.aoa_to_sheet(
    [
      READABLE_COLUMNS.map(([label]) => label),
      ...details.map((row) =>
        READABLE_COLUMNS.map(([, key]) =>
          key === 'sold_at' ? toUtcDate(row[key]) : cellValue(row[key])
        )
      ),
    ],
    { cellDates: true, dateNF: 'yyyy-mm-dd hh:mm "UTC"' }
  );
  const summarySheet = XLSX.utils.aoa_to_sheet([
    SUMMARY_COLUMNS.map(([label]) => label),
    ...summary.map((row) => valuesForColumns(row, SUMMARY_COLUMNS)),
  ]);
  const technicalSheet = XLSX.utils.aoa_to_sheet([
    TECHNICAL_COLUMNS.map(([label]) => label),
    ...orderedRows.map((row) => valuesForColumns(row, TECHNICAL_COLUMNS)),
  ]);

  setSheetLayout(detailSheet, READABLE_COLUMN_WIDTHS, [6, 8, 9], [1]);
  setSheetLayout(
    summarySheet,
    [24, 36, 24, 16, 12, 16, 14, 16, 20],
    [5, 6, 7, 8]
  );
  setSheetLayout(
    technicalSheet,
    TECHNICAL_COLUMNS.map(([, key]) =>
      String(key).endsWith('_id') || key === 'sale_id' ? 38 : 22
    ),
    [7, 32, 33, 34]
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Sales Details');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Product Summary');
  XLSX.utils.book_append_sheet(workbook, technicalSheet, 'Technical Data');
  return XLSX.write(workbook, {
    bookType: 'xlsx',
    cellDates: true,
    compression: true,
    type: 'array',
  });
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
