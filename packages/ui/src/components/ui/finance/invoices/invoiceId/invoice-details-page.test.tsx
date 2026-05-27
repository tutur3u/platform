import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceDetailsPage from './invoice-details-page.js';

type QueryOperation = {
  eqs: Array<{ column: string; value: unknown }>;
  select?: string;
  table: string;
};

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  invoice: null as Record<string, unknown> | null,
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
  operations: [] as QueryOperation[],
}));

function resultForTable(table: string) {
  if (table === 'finance_invoices') {
    return { data: mocks.invoice, error: null };
  }

  if (table === 'finance_invoice_products') {
    return {
      data: [
        {
          amount: 2,
          created_at: null,
          finance_invoices: { ws_id: 'workspace-1' },
          invoice_id: 'invoice-1',
          owner_id: null,
          owner_name: '',
          price: 100,
          product_id: null,
          product_name: 'Product',
          product_unit: 'item',
          total_diff: 0,
          unit_id: 'unit-1',
          warehouse: '',
          warehouse_id: 'warehouse-1',
        },
      ],
      error: null,
    };
  }

  if (table === 'finance_invoice_promotions') {
    return {
      data: [
        {
          code: 'SAVE',
          created_at: '2026-05-01T00:00:00.000Z',
          description: null,
          finance_invoices: { ws_id: 'workspace-1' },
          invoice_id: 'invoice-1',
          name: 'Save',
          promo_id: 'promo-1',
          use_ratio: false,
          value: 10,
        },
      ],
      error: null,
    };
  }

  return { data: [], error: null };
}

function createQueryBuilder(table: string) {
  const operation: QueryOperation = { eqs: [], table };
  mocks.operations.push(operation);

  const builder = {
    eq: vi.fn((column: string, value: unknown) => {
      operation.eqs.push({ column, value });
      return builder;
    }),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => resultForTable(table)),
    order: vi.fn(() => builder),
    select: vi.fn((select?: string) => {
      operation.select = select;
      return builder;
    }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaited as thenables in component code.
    then: vi.fn((resolve, reject) =>
      Promise.resolve(resultForTable(table)).then(resolve, reject)
    ),
  };

  return builder;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('@tuturuuu/ui/custom/feature-summary', () => ({
  default: () => <div data-testid="feature-summary" />,
}));

vi.mock('@tuturuuu/ui/finance/shared/finance-display-amount', () => ({
  FinanceDisplayAmount: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock('./invoice-card', () => ({
  default: () => <div data-testid="invoice-card" />,
}));

vi.mock('./invoice-edit-form', () => ({
  default: () => <div data-testid="invoice-edit-form" />,
}));

vi.mock('@tuturuuu/ui/finance/invoices/invoiceId/product-card', () => ({
  ProductCard: () => <div data-testid="product-card" />,
}));

vi.mock('@tuturuuu/ui/finance/invoices/invoiceId/promotion-card', () => ({
  PromotionCard: () => <div data-testid="promotion-card" />,
}));

describe('InvoiceDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.operations.length = 0;
    mocks.invoice = {
      created_at: '2026-05-01T00:00:00.000Z',
      customer_avatar_url: null,
      customer_display_name: 'Customer',
      customer_full_name: 'Customer One',
      id: 'invoice-1',
      legacy_creator: null,
      note: null,
      notice: null,
      platform_creator: null,
      price: 100,
      total_diff: 0,
      wallet_id: 'wallet-1',
    };
    mocks.createAdminClient.mockResolvedValue({
      from: (table: string) => createQueryBuilder(table),
    });
  });

  it('loads invoice details and children through workspace-bound admin queries', async () => {
    await InvoiceDetailsPage({
      invoiceId: 'invoice-1',
      locale: 'en',
      wsId: 'workspace-1',
    });

    expect(mocks.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eqs: expect.arrayContaining([
            { column: 'id', value: 'invoice-1' },
            { column: 'ws_id', value: 'workspace-1' },
          ]),
          table: 'finance_invoices',
        }),
        expect.objectContaining({
          eqs: expect.arrayContaining([
            { column: 'invoice_id', value: 'invoice-1' },
            { column: 'finance_invoices.ws_id', value: 'workspace-1' },
          ]),
          select: '*, finance_invoices!inner(ws_id)',
          table: 'finance_invoice_products',
        }),
        expect.objectContaining({
          eqs: expect.arrayContaining([
            { column: 'invoice_id', value: 'invoice-1' },
            { column: 'finance_invoices.ws_id', value: 'workspace-1' },
          ]),
          select: '*, finance_invoices!inner(ws_id)',
          table: 'finance_invoice_promotions',
        }),
      ])
    );
  });

  it('does not load invoice children when the invoice is outside the workspace', async () => {
    mocks.invoice = null;

    await expect(
      InvoiceDetailsPage({
        invoiceId: 'invoice-from-another-workspace',
        locale: 'en',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('not-found');

    expect(mocks.operations.map((operation) => operation.table)).toEqual([
      'finance_invoices',
    ]);
  });
});
