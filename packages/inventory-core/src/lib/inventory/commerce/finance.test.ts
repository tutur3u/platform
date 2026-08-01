import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getWorkspaceConfig: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: (...args: unknown[]) => mocks.getWorkspaceConfig(...args),
}));

import {
  decideSaleBooking,
  normalizeInventoryFinanceAmount,
  recordInventorySaleFinanceTransaction,
  resolveCategoryPreference,
  resolveCompatibleWalletId,
  resolveSharedFinanceCategoryId,
} from './finance';

function chain(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'insert', 'update', 'is']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  query.single = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
  query.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return query;
}

function createCheckout(overrides: Record<string, unknown> = {}) {
  return {
    checkout_provider: 'square_pos',
    completed_at: '2026-07-01T00:00:00Z',
    created_at: '2026-06-30T00:00:00Z',
    currency: 'USD',
    customer_email: 'customer@example.test',
    customer_name: 'Customer',
    finance_transaction_id: null,
    id: 'checkout-1',
    polar_order_id: null,
    square_order_id: 'order-1',
    square_payment_id: 'payment-1',
    status: 'completed',
    total_amount: 25000,
    updated_at: '2026-07-01T00:00:00Z',
    ws_id: 'ws-1',
    ...overrides,
  };
}

function configureRuntime({
  checkout = createCheckout(),
  mapping = {
    category_id: '33333333-3333-4333-8333-333333333333',
    wallet_id: '11111111-1111-4111-8111-111111111111',
  },
  rpcRow = {
    entry_id: 'entry-1',
    reconciliation_status: 'linked',
    synchronization_error: null,
    wallet_transaction_id: 'tx-1',
  },
  wallets = [
    {
      currency: 'USD',
      id: '11111111-1111-4111-8111-111111111111',
    },
  ],
}: {
  checkout?: Record<string, unknown>;
  mapping?: { category_id: string | null; wallet_id: string | null } | null;
  rpcRow?: Record<string, unknown>;
  wallets?: Array<{ currency: string; id: string }>;
} = {}) {
  const rpc = vi.fn(() => Promise.resolve({ data: [rpcRow], error: null }));
  const privateFrom = vi.fn((table: string) => {
    if (table === 'inventory_checkout_sessions') {
      return chain({ data: checkout, error: null });
    }
    if (table === 'inventory_finance_provider_mappings') {
      return chain({ data: mapping, error: null });
    }
    if (table === 'inventory_checkout_lines') {
      return chain({ data: [{ product_id: 'product-1' }], error: null });
    }
    if (table === 'workspace_wallets') {
      return chain({ data: wallets, error: null });
    }
    return chain({ data: null, error: null });
  });
  const publicFrom = vi.fn((table: string) => {
    if (table === 'workspace_products') {
      return chain({
        data: [{ finance_category_id: '33333333-3333-4333-8333-333333333333' }],
        error: null,
      });
    }
    if (table === 'transaction_categories') {
      return chain({
        data: [{ id: '33333333-3333-4333-8333-333333333333' }],
        error: null,
      });
    }
    return chain({ data: null, error: null });
  });
  mocks.createAdminClient.mockResolvedValue({
    from: publicFrom,
    schema: vi.fn(() => ({ from: privateFrom, rpc })),
  });
  return { rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWorkspaceConfig.mockImplementation((_wsId: string, key: string) => {
    if (key === 'inventory_default_revenue_wallet_id') {
      return Promise.resolve('22222222-2222-4222-8222-222222222222');
    }
    if (key === 'default_wallet_id') {
      return Promise.resolve('44444444-4444-4444-8444-444444444444');
    }
    if (key === 'inventory_default_finance_category_id') {
      return Promise.resolve('55555555-5555-4555-8555-555555555555');
    }
    return Promise.resolve(null);
  });
});

describe('sale eligibility', () => {
  it('accepts completed cash sales as real-provider revenue', () => {
    expect(
      decideSaleBooking({
        checkout_provider: 'cash',
        finance_transaction_id: 'cash-transaction',
        status: 'completed',
        total_amount: 100,
      })
    ).toEqual({ book: true });
  });

  it('accepts completed real-provider sales even when a legacy link exists', () => {
    expect(
      decideSaleBooking({
        checkout_provider: 'square_pos',
        finance_transaction_id: 'legacy-tx',
        status: 'completed',
        total_amount: 100,
      })
    ).toEqual({ book: true });
  });

  it('excludes simulated and incomplete checkouts', () => {
    expect(
      decideSaleBooking({
        checkout_provider: 'simulated',
        finance_transaction_id: null,
        status: 'completed',
        total_amount: 100,
      })
    ).toEqual({ book: false, reason: 'unsupported-provider' });
    expect(
      decideSaleBooking({
        checkout_provider: 'polar',
        finance_transaction_id: null,
        status: 'reserved',
        total_amount: 100,
      })
    ).toEqual({ book: false, reason: 'not-completed' });
  });
});

describe('default resolution', () => {
  it('requires every product to agree on a category', () => {
    expect(resolveSharedFinanceCategoryId(['category-1', 'category-1'])).toBe(
      'category-1'
    );
    expect(resolveSharedFinanceCategoryId(['category-1', null])).toBeNull();
    expect(resolveSharedFinanceCategoryId(['category-1', 'category-2'])).toBe(
      null
    );
  });

  it('uses the first currency-compatible wallet in precedence order', () => {
    expect(
      resolveCompatibleWalletId({
        candidates: [
          { currency: 'VND', id: 'provider-wallet' },
          { currency: 'USD', id: 'inventory-wallet' },
          { currency: 'USD', id: 'finance-wallet' },
        ],
        currency: 'USD',
        preferenceIds: [
          'provider-wallet',
          'inventory-wallet',
          'finance-wallet',
        ],
      })
    ).toBe('inventory-wallet');
  });

  it('uses product, provider, then Inventory category precedence', () => {
    expect(
      resolveCategoryPreference({
        availableCategoryIds: ['product', 'provider', 'inventory'],
        inventoryDefaultCategoryId: 'inventory',
        productCategoryId: 'product',
        providerCategoryId: 'provider',
      })
    ).toBe('product');
    expect(
      resolveCategoryPreference({
        availableCategoryIds: ['provider', 'inventory'],
        inventoryDefaultCategoryId: 'inventory',
        productCategoryId: 'stale-product',
        providerCategoryId: 'provider',
      })
    ).toBe('provider');
  });
});

describe('provider amount normalization', () => {
  it('normalizes sales and releases positive and corrections negative', () => {
    expect(normalizeInventoryFinanceAmount('sale', -100)).toBe(100);
    expect(normalizeInventoryFinanceAmount('refund', 25)).toBe(-25);
    expect(normalizeInventoryFinanceAmount('chargeback_hold', 40)).toBe(-40);
    expect(normalizeInventoryFinanceAmount('chargeback_release', -40)).toBe(40);
    expect(
      normalizeInventoryFinanceAmount('manual_provider_adjustment', -7)
    ).toBe(-7);
  });
});

describe('recordInventorySaleFinanceTransaction', () => {
  it('posts through the atomic RPC with provider and category defaults', async () => {
    const { rpc } = configureRuntime();

    await expect(
      recordInventorySaleFinanceTransaction({ checkoutId: 'checkout-1' })
    ).resolves.toEqual({
      booked: true,
      entryId: 'entry-1',
      reason: undefined,
      status: 'linked',
      transactionId: 'tx-1',
    });

    expect(rpc).toHaveBeenCalledWith(
      'upsert_inventory_finance_entry',
      expect.objectContaining({
        p_amount_minor: 25000,
        p_category_id: '33333333-3333-4333-8333-333333333333',
        p_entry_kind: 'sale',
        p_provider: 'square_pos',
        p_source_key: 'sale:payment-1',
        p_wallet_id: '11111111-1111-4111-8111-111111111111',
      })
    );
  });

  it('creates a pending source entry when no wallet matches the currency', async () => {
    const { rpc } = configureRuntime({
      mapping: { category_id: null, wallet_id: null },
      rpcRow: {
        entry_id: 'entry-pending',
        reconciliation_status: 'pending',
        synchronization_error: null,
        wallet_transaction_id: null,
      },
      wallets: [
        {
          currency: 'VND',
          id: '22222222-2222-4222-8222-222222222222',
        },
      ],
    });

    const result = await recordInventorySaleFinanceTransaction({
      checkoutId: 'checkout-1',
    });

    expect(result).toEqual({
      booked: false,
      entryId: 'entry-pending',
      reason: 'no-compatible-wallet',
      status: 'pending',
      transactionId: undefined,
    });
    expect(rpc).toHaveBeenCalledWith(
      'upsert_inventory_finance_entry',
      expect.objectContaining({ p_wallet_id: null })
    );
  });

  it('never creates entries for simulated checkouts', async () => {
    const { rpc } = configureRuntime({
      checkout: createCheckout({ checkout_provider: 'simulated' }),
    });

    await expect(
      recordInventorySaleFinanceTransaction({ checkoutId: 'checkout-1' })
    ).resolves.toEqual({
      booked: false,
      reason: 'unsupported-provider',
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
