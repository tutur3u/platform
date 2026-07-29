import { XLSX } from '@tuturuuu/ui/xlsx';
import { describe, expect, it } from 'vitest';
import {
  buildInventorySalesCsv,
  buildInventorySalesWorkbook,
  inventorySalesExportFilename,
  normalizeInventorySalesExportRows,
} from './export-format';

const RAW_ROW = {
  category_name: 'Merch',
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
  product_id: 'product-1',
  product_name: '@PRODUCT',
  public_token: 'token-1',
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
      [{ ...RAW_ROW, currency: 'JPY', sale_amount: 500 }],
      'USD'
    );

    expect(row?.sale_amount).toBe(500);
  });

  it('writes UTF-8 CSV with escaped values and neutralized formulas', () => {
    const rows = normalizeInventorySalesExportRows([RAW_ROW], 'USD');
    const csv = buildInventorySalesCsv(rows);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(`"'=FORMULA"`);
    expect(csv).toContain(`"'@PRODUCT"`);
    expect(csv).toContain(`"A ""quoted"", note"`);
    expect(csv).toContain('\r\n');
  });

  it('creates separate sales and line-item worksheets without duplicate sales', () => {
    const rows = normalizeInventorySalesExportRows(
      [RAW_ROW, { ...RAW_ROW, line_id: 'line-2', product_name: 'Second' }],
      'USD'
    );
    const workbook = XLSX.read(buildInventorySalesWorkbook(rows), {
      type: 'array',
    });
    const sales = XLSX.utils.sheet_to_json(workbook.Sheets.Sales!, {
      header: 1,
    });
    const lines = XLSX.utils.sheet_to_json(workbook.Sheets['Line Items']!, {
      header: 1,
    });

    expect(workbook.SheetNames).toEqual(['Sales', 'Line Items']);
    expect(sales).toHaveLength(2);
    expect(lines).toHaveLength(3);
    expect(sales[1]).toContain("'=FORMULA");
  });

  it('sanitizes filenames while preserving the requested extension', () => {
    expect(inventorySalesExportFilename('Hè / Offkai 2026', 'xlsx')).toBe(
      'inventory-sales-he-offkai-2026.xlsx'
    );
  });
});
