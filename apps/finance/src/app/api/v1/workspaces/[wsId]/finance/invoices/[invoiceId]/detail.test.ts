import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadInvoiceDetail } from './detail';

type Result = { data: unknown; error: unknown };

function query(result: Result) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: Result) => unknown) => resolve(result),
  };
  return chain;
}

function client(tables: Record<string, Result>) {
  const from = vi.fn((table: string) => {
    const result = tables[table];
    if (!result) throw new Error(`Unexpected table: ${table}`);
    return query(result);
  });
  return {
    from,
    schema: vi.fn(() => ({ from })),
  };
}

describe('loadInvoiceDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('joins products, promotions and the wallet name', async () => {
    const sbAdmin = client({
      finance_invoices: {
        data: {
          id: 'invoice-1',
          price: 300,
          total_diff: -30,
          wallet_id: 'wallet-1',
          customer: { display_name: 'Quinn', full_name: 'Quinn Tran' },
        },
        error: null,
      },
      finance_invoice_products: {
        data: [{ product_name: 'Lessons', amount: 3, price: 100 }],
        error: null,
      },
      finance_invoice_promotions: {
        data: [{ code: 'SPRING10', value: 10, use_ratio: true }],
        error: null,
      },
      workspace_wallets: {
        data: { name: 'Cash', currency: 'VND' },
        error: null,
      },
    });

    const detail = await loadInvoiceDetail(
      sbAdmin as never,
      'ws-1',
      'invoice-1'
    );

    expect(detail).toMatchObject({
      id: 'invoice-1',
      customer_name: 'Quinn Tran',
      wallet_name: 'Cash',
      wallet_currency: 'VND',
      products: [{ product_name: 'Lessons' }],
      promotions: [{ code: 'SPRING10' }],
    });
    expect(detail).not.toHaveProperty('customer');
  });

  it('returns null for an invoice outside the workspace', async () => {
    const sbAdmin = client({
      finance_invoices: { data: null, error: null },
    });
    await expect(
      loadInvoiceDetail(sbAdmin as never, 'ws-1', 'missing')
    ).resolves.toBeNull();
  });
});
