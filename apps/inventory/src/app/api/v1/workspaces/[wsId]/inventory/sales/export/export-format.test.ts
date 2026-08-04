import { XLSX } from '@tuturuuu/ui/xlsx';
import { describe, expect, it } from 'vitest';
import {
  buildInventorySalesCsv,
  buildInventorySalesWorkbook,
  inventorySalesExportFilename,
  normalizeInventorySalesExportRows,
} from './export-format';

const RAW_ROW = {
  allocation_source: 'stock_snapshot',
  category_name: 'Merch income',
  checkout_provider: 'square_pos',
  completed_at: '2026-07-29T01:00:00.000Z',
  created_at: '2026-07-29T00:00:00.000Z',
  creator_name: null,
  currency: 'USD',
  customer_email: 'customer@example.test',
  customer_name: '=FORMULA',
  finance_invoice_id: null,
  line_id: 'line-1',
  line_total: 250,
  monetary_unit: 'minor' as const,
  note: 'A "quoted", note',
  notice: 'Order',
  owner_id: 'owner-1',
  owner_name: 'Owner',
  period_id: 'period-1',
  period_name: 'Hè 2026',
  polar_order_id: null,
  product_category_name: 'Posters',
  product_id: 'product-1',
  product_name: '@PRODUCT',
  public_token: 'public-token-1',
  quantity: 2,
  sale_amount: 250,
  sale_id: 'sale-1',
  sale_source: 'checkout_session' as const,
  square_order_id: 'square-1',
  transaction_id: null,
  unit_id: 'unit-1',
  unit_name: 'Piece',
  unit_price: 125,
  wallet_name: null,
  warehouse_id: 'warehouse-1',
  warehouse_name: 'Booth',
};

const READABLE_HEADERS = [
  'Sale Reference',
  'Sold At (UTC)',
  'Sales Channel',
  'Item Category',
  'Item Name',
  'Owner',
  'Quantity',
  'Unit',
  'Unit Price',
  'Line Total',
  'Currency',
  'Customer Name',
  'Customer Email',
  'Warehouse',
  'Transaction Category',
  'Wallet',
  'Creator',
  'Notice',
  'Note',
];

describe('inventory sales export formatting', () => {
  it('normalizes source-specific money units and preserves stable timestamps', () => {
    const [row] = normalizeInventorySalesExportRows([RAW_ROW], 'VND');

    expect(row).toMatchObject({
      currency: 'USD',
      line_total: 2.5,
      sale_amount: 2.5,
      sale_timestamp: RAW_ROW.completed_at,
      unit_price: 1.25,
    });
  });

  it('uses currency exponents instead of assuming two decimal places', () => {
    const [row] = normalizeInventorySalesExportRows(
      [
        {
          ...RAW_ROW,
          currency: 'JPY',
          line_total: 500,
          sale_amount: 500,
          unit_price: 500,
        },
      ],
      'USD'
    );

    expect(row).toMatchObject({
      line_total: 500,
      sale_amount: 500,
      unit_price: 500,
    });
  });

  it('writes readable CSV columns first and technical audit fields last', () => {
    const rows = normalizeInventorySalesExportRows([RAW_ROW], 'USD');
    const csv = buildInventorySalesCsv(rows);
    const [header, data] = csv.slice(1).split('\r\n');

    expect(header?.split(',').slice(0, READABLE_HEADERS.length)).toEqual(
      READABLE_HEADERS.map((label) => `"${label}"`)
    );
    expect(header).toContain('"Raw Sale Source"');
    expect(header?.endsWith('"Sale Total"')).toBe(true);
    expect(data).toContain('"PUBLIC-T"');
    expect(data).toContain('"Square POS"');
    expect(data).toContain('"Posters"');
    expect(data).toContain('"\'@PRODUCT"');
    expect(data).toContain('"\'=FORMULA"');
    expect(data).toContain('"A ""quoted"", note"');
    expect(data).toContain('"sale-1"');
    expect(data).toContain('"stock_snapshot"');
  });

  it('uses readable fallbacks and title-cases unknown providers', () => {
    const rows = normalizeInventorySalesExportRows(
      [
        {
          ...RAW_ROW,
          category_name: null,
          checkout_provider: 'festival_kiosk',
          owner_name: null,
          product_category_name: null,
          product_name: null,
          public_token: null,
          unit_name: null,
          warehouse_name: null,
        },
      ],
      'USD'
    );
    const csv = buildInventorySalesCsv(rows);

    expect(csv).toContain('"SALE-1"');
    expect(csv).toContain('"Festival Kiosk"');
    expect(csv).toContain('"Uncategorized"');
    expect(csv).toContain('"Unnamed item"');
    expect(csv).toContain('"Unassigned"');
  });

  it('creates readable detail, currency-safe summary, and technical worksheets', () => {
    const rows = normalizeInventorySalesExportRows(
      [
        RAW_ROW,
        {
          ...RAW_ROW,
          line_id: 'line-2',
          line_total: 125,
          product_name: '@PRODUCT',
          quantity: 1,
          unit_price: 125,
        },
        {
          ...RAW_ROW,
          currency: 'JPY',
          line_id: 'line-3',
          line_total: 500,
          monetary_unit: 'minor',
          quantity: 1,
          sale_amount: 500,
          sale_id: 'sale-2',
          unit_price: 500,
        },
        {
          ...RAW_ROW,
          line_id: null,
          line_total: null,
          product_category_name: null,
          product_id: null,
          product_name: null,
          quantity: null,
          sale_id: 'sale-without-item',
          unit_price: null,
        },
      ],
      'USD'
    );
    const workbook = XLSX.read(buildInventorySalesWorkbook(rows), {
      cellDates: true,
      cellStyles: true,
      type: 'array',
    });
    const detailSheet = workbook.Sheets['Sales Details']!;
    const summarySheet = workbook.Sheets['Product Summary']!;
    const technicalSheet = workbook.Sheets['Technical Data']!;
    const details = XLSX.utils.sheet_to_json<unknown[]>(detailSheet, {
      header: 1,
      raw: true,
    });
    const summary = XLSX.utils.sheet_to_json<unknown[]>(summarySheet, {
      header: 1,
      raw: true,
    });
    const technical = XLSX.utils.sheet_to_json<unknown[]>(technicalSheet, {
      header: 1,
      raw: true,
    });

    expect(workbook.SheetNames).toEqual([
      'Sales Details',
      'Product Summary',
      'Technical Data',
    ]);
    expect(details[0]?.slice(0, 5)).toEqual(READABLE_HEADERS.slice(0, 5));
    expect(details.flat()).toContain('Unnamed item');
    expect(detailSheet.B2?.t).toBe('d');
    expect(detailSheet['!autofilter']?.ref).toBe(detailSheet['!ref']);
    expect(detailSheet['!cols']?.[4]?.width).toBeGreaterThan(30);

    expect(summary).toHaveLength(3);
    expect(summary[1]?.slice(0, 9)).toEqual([
      'Posters',
      "'@PRODUCT",
      'Owner',
      'Piece',
      'JPY',
      1,
      1,
      500,
      500,
    ]);
    expect(summary[2]?.slice(0, 9)).toEqual([
      'Posters',
      "'@PRODUCT",
      'Owner',
      'Piece',
      'USD',
      3,
      1,
      3.75,
      1.25,
    ]);
    expect(summarySheet['!autofilter']?.ref).toBe(summarySheet['!ref']);

    expect(technical[0]).toContain('Product Category');
    expect(technical[1]).toContain('product-1');
    expect(technical[1]).toContain('line-1');
    expect(technicalSheet['!autofilter']?.ref).toBe(technicalSheet['!ref']);
  });

  it('sanitizes filenames while preserving the requested extension', () => {
    expect(inventorySalesExportFilename('Hè / Offkai 2026', 'xlsx')).toBe(
      'inventory-sales-he-offkai-2026.xlsx'
    );
  });
});
