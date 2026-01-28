import { describe, expect, it, vi } from 'vitest';
import { fetchSubscription } from '../../utils/subscription-helper';

// Mock Supabase client
const mockMaybeSingle = vi.fn();
const mockOrder = vi.fn(() => ({
  limit: vi.fn(() => ({
    maybeSingle: mockMaybeSingle,
  })),
}));
const mockEq = vi.fn(() => ({
  eq: vi.fn(() => ({
    order: mockOrder,
  })),
}));
const mockSelect = vi.fn(() => ({
  eq: mockEq,
}));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('subscription-helper utils', () => {
  const wsId = 'ws-123';

  describe('fetchSubscription', () => {
    it('should return subscription with seat-based properties', async () => {
      const mockDbSub = {
        id: 'sub-123',
        status: 'active',
        created_at: '2026-01-28T00:00:00Z',
        current_period_start: '2026-01-28T00:00:00Z',
        current_period_end: '2026-02-28T00:00:00Z',
        cancel_at_period_end: false,
        pricing_model: 'seat_based',
        seat_count: 10,
        price_per_seat: 1500,
        workspace_subscription_products: {
          id: 'prod-123',
          name: 'Pro Plan',
          pricing_model: 'seat_based',
          price_per_seat: 1500,
        },
      };

      mockMaybeSingle.mockResolvedValue({ data: mockDbSub, error: null });

      const subscription = await fetchSubscription(wsId);

      expect(subscription).not.toBeNull();
      expect(subscription?.pricingModel).toBe('seat_based');
      expect(subscription?.seatCount).toBe(10);
      expect(subscription?.pricePerSeat).toBe(1500);
      expect(subscription?.product.id).toBe('prod-123');
    });

    it('should return null if no active subscription found', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const subscription = await fetchSubscription(wsId);

      expect(subscription).toBeNull();
    });

    it('should return subscription with fixed pricing properties', async () => {
      const mockDbSub = {
        id: 'sub-456',
        status: 'active',
        pricing_model: 'fixed',
        seat_count: null,
        price_per_seat: null,
        workspace_subscription_products: {
          id: 'prod-456',
          name: 'Free Plan',
          pricing_model: 'fixed',
          price_per_seat: null,
        },
      };

      mockMaybeSingle.mockResolvedValue({ data: mockDbSub, error: null });

      const subscription = await fetchSubscription(wsId);

      expect(subscription).not.toBeNull();
      expect(subscription?.pricingModel).toBe('fixed');
      expect(subscription?.seatCount).toBeNull();
    });
  });
});
