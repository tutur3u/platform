import { describe, expect, it, vi } from 'vitest';

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
  recordInventorySaleFinanceTransaction,
  resolveSharedFinanceCategoryId,
} from './finance';

describe('decideSaleBooking', () => {
  const base = {
    finance_transaction_id: null,
    status: 'completed',
    total_amount: 100,
  };

  it('books a completed, unbooked, positive sale', () => {
    expect(decideSaleBooking(base)).toEqual({ book: true });
  });

  it('skips sales that are not completed', () => {
    expect(decideSaleBooking({ ...base, status: 'reserved' })).toEqual({
      book: false,
      reason: 'not-completed',
    });
  });

  it('skips already-booked sales (idempotency)', () => {
    expect(
      decideSaleBooking({ ...base, finance_transaction_id: 'tx-1' })
    ).toEqual({ book: false, reason: 'already-booked' });
  });

  it('skips zero or negative totals', () => {
    expect(decideSaleBooking({ ...base, total_amount: 0 })).toEqual({
      book: false,
      reason: 'zero-amount',
    });
  });
});

describe('resolveSharedFinanceCategoryId', () => {
  it('returns the shared category when all lines agree', () => {
    expect(resolveSharedFinanceCategoryId(['c1', 'c1'])).toBe('c1');
  });

  it('returns null when categories differ', () => {
    expect(resolveSharedFinanceCategoryId(['c1', 'c2'])).toBeNull();
  });

  it('returns null when nothing is categorized', () => {
    expect(resolveSharedFinanceCategoryId([null, undefined])).toBeNull();
  });
});

/** Minimal awaitable query-chain stub keyed by terminal results. */
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'insert', 'update', 'is']) {
    c[method] = vi.fn(() => c);
  }
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.single = vi.fn(() => Promise.resolve(result));
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable stub so the chain can be awaited directly like a terminal Supabase query builder.
  c.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return c;
}

describe('recordInventorySaleFinanceTransaction', () => {
  it('books revenue with the sale total, shared category, and default wallet', async () => {
    mocks.getWorkspaceConfig.mockResolvedValue('wallet-1');
    const insertChain = chain({ data: { id: 'tx-99' }, error: null });

    const privateFrom = vi.fn((table: string) => {
      if (table === 'inventory_checkout_sessions') {
        return chain({
          data: {
            completed_at: '2026-06-15T00:00:00Z',
            currency: 'USD',
            finance_transaction_id: null,
            id: 'sess-1',
            polar_order_id: 'polar-7',
            status: 'completed',
            total_amount: 250,
            ws_id: 'ws-1',
          },
        });
      }
      return chain({ data: [{ product_id: 'p1' }, { product_id: 'p1' }] });
    });
    const publicFrom = vi.fn((table: string) => {
      if (table === 'wallet_transactions') return insertChain;
      return chain({ data: [{ finance_category_id: 'cat-1' }] });
    });

    mocks.createAdminClient.mockResolvedValue({
      from: publicFrom,
      schema: vi.fn(() => ({ from: privateFrom })),
    });

    const result = await recordInventorySaleFinanceTransaction({
      checkoutId: 'sess-1',
    });

    expect(result).toEqual({ booked: true, transactionId: 'tx-99' });
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 250,
        category_id: 'cat-1',
        report_opt_in: true,
        wallet_id: 'wallet-1',
      })
    );
  });

  it('does not book when there is no default wallet', async () => {
    mocks.getWorkspaceConfig.mockResolvedValue(null);
    const insertChain = chain({ data: { id: 'tx' }, error: null });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => insertChain),
      schema: vi.fn(() => ({
        from: vi.fn(() =>
          chain({
            data: {
              completed_at: null,
              finance_transaction_id: null,
              id: 'sess-1',
              polar_order_id: null,
              status: 'completed',
              total_amount: 100,
              ws_id: 'ws-1',
            },
          })
        ),
      })),
    });

    const result = await recordInventorySaleFinanceTransaction({
      checkoutId: 'sess-1',
    });

    expect(result).toEqual({ booked: false, reason: 'no-default-wallet' });
    expect(insertChain.insert).not.toHaveBeenCalled();
  });
});
