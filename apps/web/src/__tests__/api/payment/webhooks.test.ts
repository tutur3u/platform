import { describe, expect, it, vi } from 'vitest';

// Mock dependencies that cause issues in test environment
vi.mock('@tuturuuu/payment/polar/next', () => ({
  Webhooks: vi.fn(),
}));

vi.mock('@tuturuuu/payment/polar/client', () => ({
  createPolarClient: vi.fn(),
}));

import { syncSubscriptionToDatabase } from '../../../app/api/payment/webhooks/route';

// Mock Supabase admin client
const mockSingle = vi.fn();
const mockUpsert = vi.fn();

const mockSupabase = {
  from: vi.fn().mockImplementation((table) => {
    if (table === 'workspace_subscription_products') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: mockSingle,
      };
    }
    if (table === 'workspace_subscriptions') {
      return {
        upsert: mockUpsert,
      };
    }
    return {};
  }),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

describe('syncSubscriptionToDatabase', () => {
  const mockSubscription: any = {
    id: 'sub_123',
    customer: { id: 'cust_123' },
    status: 'active',
    metadata: { wsId: '00000000-0000-0000-0000-000000000000' },
    product: { id: 'prod_123' },
    seats: 5,
    currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    modifiedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('should identify seat-based pricing and save seat count', async () => {
    // Mock product to be seat-based
    mockSingle.mockResolvedValue({
      data: { pricing_model: 'seat_based', price_per_seat: 1000 },
      error: null,
    });
    mockUpsert.mockResolvedValue({ error: null });

    const result = await syncSubscriptionToDatabase(mockSubscription);

    expect(result.isSeatBased).toBe(true);
    expect(result.subscriptionData.seat_count).toBe(5);
    expect(result.subscriptionData.ws_id).toBe(
      '00000000-0000-0000-0000-000000000000'
    );
    expect(result.subscriptionData.status).toBe('active');
    expect(result.subscriptionData.polar_subscription_id).toBe('sub_123');
    expect(result.subscriptionData.product_id).toBe('prod_123');
    expect(result.subscriptionData.cancel_at_period_end).toBe(false);

    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          ws_id: '00000000-0000-0000-0000-000000000000',
          status: 'active',
          polar_subscription_id: 'sub_123',
          product_id: 'prod_123',
          seat_count: 5,
          cancel_at_period_end: false,
          current_period_start: '2026-01-01T00:00:00.000Z',
          current_period_end: '2026-02-01T00:00:00.000Z',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }),
      ],
      {
        onConflict: 'polar_subscription_id',
        ignoreDuplicates: false,
      }
    );
  });

  it('should handle fixed pricing correctly', async () => {
    // Mock product to be fixed price
    mockSingle.mockResolvedValue({
      data: { pricing_model: 'fixed', price_per_seat: null },
      error: null,
    });
    mockUpsert.mockResolvedValue({ error: null });

    const result = await syncSubscriptionToDatabase({
      ...mockSubscription,
      seats: null,
    });

    expect(result.isSeatBased).toBe(false);
    expect(result.subscriptionData.seat_count).toBeNull();
    expect(result.subscriptionData.ws_id).toBe(
      '00000000-0000-0000-0000-000000000000'
    );
    expect(result.subscriptionData.status).toBe('active');

    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          ws_id: '00000000-0000-0000-0000-000000000000',
          status: 'active',
          polar_subscription_id: 'sub_123',
          product_id: 'prod_123',
          seat_count: null,
          cancel_at_period_end: false,
        }),
      ],
      {
        onConflict: 'polar_subscription_id',
        ignoreDuplicates: false,
      }
    );
  });

  it('should throw error when workspace ID is missing', async () => {
    const subscriptionWithoutWsId = {
      ...mockSubscription,
      metadata: {},
    };

    await expect(
      syncSubscriptionToDatabase(subscriptionWithoutWsId)
    ).rejects.toThrow();
  });

  it('should handle date conversion correctly', async () => {
    mockSingle.mockResolvedValue({
      data: { pricing_model: 'seat_based', price_per_seat: 1000 },
      error: null,
    });
    mockUpsert.mockResolvedValue({ error: null });

    const subscriptionWithStringDates = {
      ...mockSubscription,
      currentPeriodStart: '2026-01-15T10:30:00Z',
      currentPeriodEnd: '2026-02-15T10:30:00Z',
      createdAt: '2026-01-15T10:30:00Z',
      modifiedAt: '2026-01-15T10:30:00Z',
    };

    const result = await syncSubscriptionToDatabase(
      subscriptionWithStringDates
    );

    expect(result.subscriptionData.current_period_start).toBe(
      '2026-01-15T10:30:00.000Z'
    );
    expect(result.subscriptionData.current_period_end).toBe(
      '2026-02-15T10:30:00.000Z'
    );
    expect(result.subscriptionData.created_at).toBe('2026-01-15T10:30:00.000Z');
    expect(result.subscriptionData.updated_at).toBe('2026-01-15T10:30:00.000Z');
  });
});
