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
    status: 'active',
    metadata: { wsId: 'ws_123' },
    product: { id: 'prod_123' },
    seats: 5,
    currentPeriodStart: new Date('2026-01-01'),
    currentPeriodEnd: new Date('2026-02-01'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-01-01'),
    modifiedAt: new Date('2026-01-01'),
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
    expect(result.subscriptionData.pricing_model).toBe('seat_based');
    expect(result.subscriptionData.price_per_seat).toBe(1000);

    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          seat_count: 5,
          pricing_model: 'seat_based',
        }),
      ],
      expect.any(Object)
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
    expect(result.subscriptionData.pricing_model).toBe('fixed');

    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          seat_count: null,
          pricing_model: 'fixed',
        }),
      ],
      expect.any(Object)
    );
  });

  it('should throw error if wsId is missing in metadata', async () => {
    const invalidSub = { ...mockSubscription, metadata: {} };

    await expect(syncSubscriptionToDatabase(invalidSub)).rejects.toThrow();
  });
});
