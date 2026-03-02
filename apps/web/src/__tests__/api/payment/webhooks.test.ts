import type { Subscription } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { describe, expect, it, vi } from 'vitest';
import { syncSubscriptionToDatabase } from '@/utils/polar-subscription-helper';

type MockSingleResult = Promise<{
  data: {
    pricing_model: 'seat_based' | 'fixed';
    price_per_seat: number | null;
  } | null;
  error: null;
}>;

type MockUpsertResult = Promise<{ error: null }>;

// Mock dependencies that cause issues in test environment
vi.mock('@tuturuuu/payment/polar/next', () => ({
  Webhooks: vi.fn(),
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: vi.fn(),
}));

// Mock Supabase admin client
const mockSingle = vi.fn<() => MockSingleResult>();
const mockUpsert = vi.fn<() => MockUpsertResult>();

const mockCreditPackMaybeSingle = vi.fn(() =>
  Promise.resolve({ data: null, error: null })
);
const mockCreditPackUpsert = vi.fn<() => MockUpsertResult>();

const mockSupabase = {
  from: vi.fn().mockImplementation((table) => {
    if (table === 'workspace_subscription_products') {
      const chainable = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockSingle,
          }),
        }),
      };
      return chainable;
    }
    if (table === 'workspace_subscriptions') {
      return {
        upsert: mockUpsert,
      };
    }
    if (table === 'workspace_credit_pack_purchases') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: mockCreditPackMaybeSingle,
          }),
        }),
        upsert: mockCreditPackUpsert,
      };
    }
    return {};
  }),
} as unknown as TypedSupabaseClient;

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

describe('syncSubscriptionToDatabase', () => {
  const mockSubscription = {
    id: 'sub_123',
    customer: { id: 'cust_123' },
    status: 'active',
    metadata: { wsId: '00000000-0000-0000-0000-000000000000' },
    product: { id: 'prod_123', metadata: {} },
    seats: 5,
    currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    modifiedAt: new Date('2026-01-01T00:00:00Z'),
  } as unknown as Subscription;

  it('should identify seat-based pricing and save seat count', async () => {
    // Mock product to be seat-based
    mockSingle.mockResolvedValue({
      data: { pricing_model: 'seat_based', price_per_seat: 1000 },
      error: null,
    });
    mockUpsert.mockResolvedValue({ error: null });

    const result = await syncSubscriptionToDatabase(
      mockSupabase,
      mockSubscription
    );

    expect(result.isSeatBased).toBe(true);
    expect(result.subscriptionData!.seat_count).toBe(5);
    expect(result.subscriptionData!.ws_id).toBe(
      '00000000-0000-0000-0000-000000000000'
    );
    expect(result.subscriptionData!.status).toBe('active');
    expect(result.subscriptionData!.polar_subscription_id).toBe('sub_123');
    expect(result.subscriptionData!.product_id).toBe('prod_123');
    expect(result.subscriptionData!.cancel_at_period_end).toBe(false);

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

    const result = await syncSubscriptionToDatabase(mockSupabase, {
      ...mockSubscription,
      seats: null,
    } as unknown as Subscription);

    expect(result.isSeatBased).toBe(false);
    expect(result.subscriptionData!.seat_count).toBeNull();
    expect(result.subscriptionData!.ws_id).toBe(
      '00000000-0000-0000-0000-000000000000'
    );
    expect(result.subscriptionData!.status).toBe('active');

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
    } as unknown as Subscription;

    await expect(
      syncSubscriptionToDatabase(mockSupabase, subscriptionWithoutWsId)
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
    } as unknown as Subscription;

    const result = await syncSubscriptionToDatabase(
      mockSupabase,
      subscriptionWithStringDates
    );

    expect(result.subscriptionData!.current_period_start).toBe(
      '2026-01-15T10:30:00.000Z'
    );
    expect(result.subscriptionData!.current_period_end).toBe(
      '2026-02-15T10:30:00.000Z'
    );
    expect(result.subscriptionData!.created_at).toBe(
      '2026-01-15T10:30:00.000Z'
    );
    expect(result.subscriptionData!.updated_at).toBe(
      '2026-01-15T10:30:00.000Z'
    );
  });

  it('should sync AI credit pack purchases', async () => {
    const creditPackSubscription = {
      ...mockSubscription,
      id: 'sub_pack_123',
      product: {
        id: 'pack_123',
        metadata: {
          product_type: 'ai_credit_pack',
          tokens: '5000',
        },
      },
      currentPeriodStart: new Date('2026-03-01T00:00:00Z'),
    } as unknown as Subscription;

    mockCreditPackMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mockCreditPackUpsert.mockResolvedValue({ error: null });

    const result = await syncSubscriptionToDatabase(
      mockSupabase,
      creditPackSubscription
    );

    expect('purchaseData' in result).toBe(true);
    if ('purchaseData' in result && result.purchaseData) {
      expect(result.purchaseData.ws_id).toBe(
        '00000000-0000-0000-0000-000000000000'
      );
      expect(result.purchaseData.polar_subscription_id).toBe('sub_pack_123');
      expect(result.purchaseData.credit_pack_id).toBe('pack_123');
      expect(result.purchaseData.tokens_granted).toBe(5000);
    }

    expect(mockCreditPackUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ws_id: '00000000-0000-0000-0000-000000000000',
        credit_pack_id: 'pack_123',
        polar_subscription_id: 'sub_pack_123',
        tokens_granted: 5000,
      }),
      {
        onConflict: 'polar_subscription_id',
        ignoreDuplicates: false,
      }
    );
  });
});
