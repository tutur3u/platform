import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  recordInventoryFinanceAdjustment: vi.fn(),
  recordInventorySaleFinanceTransaction: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('../finance', () => ({
  recordInventoryFinanceAdjustment: (...args: unknown[]) =>
    mocks.recordInventoryFinanceAdjustment(...args),
  recordInventorySaleFinanceTransaction: (...args: unknown[]) =>
    mocks.recordInventorySaleFinanceTransaction(...args),
}));

import {
  syncInventorySquareDispute,
  syncInventorySquareRefund,
} from './reconciliation';

function checkoutQuery() {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: {
        checkout_provider: 'square_pos',
        currency: 'USD',
        id: 'checkout-1',
      },
      error: null,
    })
  );
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockResolvedValue({
    schema: vi.fn(() => ({ from: vi.fn(() => checkoutQuery()) })),
  });
  mocks.recordInventorySaleFinanceTransaction.mockResolvedValue({
    booked: true,
  });
  mocks.recordInventoryFinanceAdjustment.mockResolvedValue({ booked: true });
});

describe('Square refund reconciliation', () => {
  it('ignores refunds until Square marks them completed', async () => {
    await expect(
      syncInventorySquareRefund(
        {
          amount_money: { amount: 1200, currency: 'USD' },
          id: 'refund-1',
          payment_id: 'payment-1',
          status: 'PENDING',
        },
        { environment: 'sandbox', wsId: 'ws-1' }
      )
    ).resolves.toBe(false);
    expect(mocks.recordInventoryFinanceAdjustment).not.toHaveBeenCalled();
  });

  it('records a completed refund using the immutable refund id', async () => {
    await expect(
      syncInventorySquareRefund(
        {
          amount_money: { amount: 1200, currency: 'USD' },
          id: 'refund-1',
          payment_id: 'payment-1',
          status: 'COMPLETED',
          updated_at: '2026-07-03T00:00:00Z',
        },
        {
          environment: 'sandbox',
          eventId: 'event-refund',
          wsId: 'ws-1',
        }
      )
    ).resolves.toBe(true);

    expect(mocks.recordInventoryFinanceAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 1200,
        checkoutId: 'checkout-1',
        kind: 'refund',
        provider: 'square_pos',
        providerReferenceId: 'refund-1',
        sourceKey: 'refund:refund-1',
      })
    );
  });
});

describe('Square dispute reconciliation', () => {
  it('records a hold and releases it only when the dispute is won', async () => {
    await syncInventorySquareDispute(
      {
        amount_money: { amount: 5000, currency: 'USD' },
        created_at: '2026-07-04T00:00:00Z',
        disputed_payment_id: 'payment-1',
        id: 'dispute-1',
        state: 'WON',
        updated_at: '2026-07-05T00:00:00Z',
      },
      { environment: 'sandbox', eventId: 'event-dispute', wsId: 'ws-1' }
    );

    expect(mocks.recordInventoryFinanceAdjustment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: 'chargeback_hold',
        sourceKey: 'dispute:dispute-1:hold',
      })
    );
    expect(mocks.recordInventoryFinanceAdjustment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'chargeback_release',
        sourceKey: 'dispute:dispute-1:release',
      })
    );
  });

  it('leaves lost disputes as a final hold', async () => {
    await syncInventorySquareDispute(
      {
        amount_money: { amount: 5000, currency: 'USD' },
        disputed_payment_id: 'payment-1',
        id: 'dispute-lost',
        state: 'LOST',
      },
      { environment: 'production', wsId: 'ws-1' }
    );

    expect(mocks.recordInventoryFinanceAdjustment).toHaveBeenCalledTimes(1);
    expect(mocks.recordInventoryFinanceAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'chargeback_hold' })
    );
  });
});
