import type { Subscription } from '@tuturuuu/payment/polar';
import { syncSubscriptionToDatabase } from '@tuturuuu/payment-core/polar-subscription-helper';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockProductLookupResult = Promise<{
  data:
    | {
        pricing_model: 'seat_based' | 'fixed';
        price_per_seat: number | null;
      }[]
    | null;
  error: { message: string } | null;
}>;

type MockProductUpsertResult = Promise<{ error: null }>;

type MockSubscriptionUpsertResult = Promise<{ error: null }>;

const seatBasedProduct = {
  pricing_model: 'seat_based' as const,
  price_per_seat: 1000,
};

const fixedProduct = {
  pricing_model: 'fixed' as const,
  price_per_seat: null,
};

const embeddedSeatBasedPolarProduct = {
  id: 'prod_123',
  name: 'Pro',
  description: 'Pro subscription',
  recurringInterval: 'month',
  isArchived: false,
  metadata: { product_tier: 'PRO' },
  prices: [
    {
      amountType: 'seat_based',
      priceCurrency: 'usd',
      priceAmount: null,
      seatTiers: {
        minimumSeats: 1,
        maximumSeats: null,
        tiers: [{ pricePerSeat: 1000 }],
      },
    },
  ],
};

type MockProductLookup = () => MockProductLookupResult;
type MockProductUpsert = () => MockProductUpsertResult;
type MockSubscriptionUpsert = () => MockSubscriptionUpsertResult;

type MockCreditPackLookup = () => Promise<{
  data: {
    pricing_model: 'seat_based' | 'fixed';
    price_per_seat: number | null;
  } | null;
  error: null;
}>;

// Mock dependencies that cause issues in test environment
vi.mock('@tuturuuu/payment/polar/next', () => ({
  Webhooks: vi.fn(),
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: vi.fn(),
}));

// Mock Supabase admin client
const mockProductLookup = vi.fn<MockProductLookup>();
const mockProductUpsert = vi.fn<MockProductUpsert>();
const mockUpsert = vi.fn<MockSubscriptionUpsert>();
const mockProjection = vi.fn();
const mockVersionFilter = vi.fn();
const mockProjectionResult = vi.fn();

const mockCreditPackMaybeSingle = vi.fn<MockCreditPackLookup>(() =>
  Promise.resolve({ data: null, error: null })
);
const mockCreditPackUpsert = vi.fn<MockSubscriptionUpsert>();

const mockSupabase = {
  from: vi.fn().mockImplementation((table) => {
    if (table === 'workspace_subscriptions') {
      return {
        upsert: mockUpsert,
        update: mockProjection,
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
  schema: vi.fn().mockImplementation((schemaName) => {
    if (schemaName !== 'private') return {};

    return {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'workspace_subscription_products') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: mockProductLookup,
              }),
            }),
            upsert: mockProductUpsert,
          };
        }
        return {};
      }),
    };
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreditPackMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockCreditPackUpsert.mockResolvedValue({ error: null });
    mockProductLookup.mockResolvedValue({
      data: [seatBasedProduct],
      error: null,
    });
    mockProductUpsert.mockResolvedValue({ error: null });
    mockUpsert.mockResolvedValue({ error: null });
    mockProjectionResult.mockResolvedValue({
      data: { id: 'local-sub' },
      error: null,
    });
    mockVersionFilter.mockReturnValue({
      select: () => ({ maybeSingle: mockProjectionResult }),
    });
    mockProjection.mockReturnValue({ eq: () => ({ or: mockVersionFilter }) });
  });

  it('should identify seat-based pricing and save seat count', async () => {
    // Mock product to be seat-based
    mockProductLookup.mockResolvedValue({
      data: [seatBasedProduct],
      error: null,
    });

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
        ignoreDuplicates: true,
      }
    );
  });

  it.each([null, 0, -1, Number.POSITIVE_INFINITY])(
    'rejects unverifiable provider seats %s before writing a subscription',
    async (seats) => {
      await expect(
        syncSubscriptionToDatabase(mockSupabase, { ...mockSubscription, seats })
      ).rejects.toThrow('Subscription seats could not be verified');
      expect(mockUpsert).not.toHaveBeenCalled();
    }
  );
  it('rejects an older projection atomically and skips webhook side effects', async () => {
    mockProjectionResult.mockResolvedValue({ data: null, error: null });
    const result = await syncSubscriptionToDatabase(
      mockSupabase,
      mockSubscription
    );
    expect(mockVersionFilter).toHaveBeenCalledWith(
      expect.stringContaining(
        'updated_at.is.null,updated_at.lt.2026-01-01T00:00:00.000Z,and('
      )
    );
    expect(result.subscriptionData).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: 'polar_subscription_id',
      ignoreDuplicates: true,
    });
  });
  it('uses creation time when an event has no modification timestamp', async () => {
    await syncSubscriptionToDatabase(mockSupabase, {
      ...mockSubscription,
      modifiedAt: null,
    });
    expect(mockVersionFilter).toHaveBeenCalledWith(
      expect.stringContaining(
        'updated_at.is.null,updated_at.lt.2026-01-01T00:00:00.000Z,and('
      )
    );
  });
  it('allows equal-version retries only when every projected value already matches', async () => {
    const result = await syncSubscriptionToDatabase(mockSupabase, {
      ...mockSubscription,
      modifiedAt: null,
    });
    expect(result.subscriptionData).toEqual(
      expect.objectContaining({
        polar_subscription_id: 'sub_123',
        seat_count: 5,
        updated_at: '2026-01-01T00:00:00.000Z',
      })
    );
    const filter = mockVersionFilter.mock.calls[0]![0] as string;
    expect(filter).not.toContain('updated_at.lte.');
    const sameVersionBranch = filter.slice(filter.indexOf('and('));
    expect(sameVersionBranch).toContain(
      'updated_at.eq."2026-01-01T00:00:00.000Z"'
    );
    expect(sameVersionBranch).toContain('seat_count.eq.5');
    expect(sameVersionBranch).toContain('product_id.eq."prod_123"');
    expect(sameVersionBranch).toContain('status.eq."active"');
    expect(sameVersionBranch).toContain('cancel_at_period_end.eq.false');
    expect(sameVersionBranch).toContain(
      'current_period_end.eq."2026-02-01T00:00:00.000Z"'
    );
    expect(sameVersionBranch).toContain(
      'current_period_start.eq."2026-01-01T00:00:00.000Z"'
    );
  });
  it('should handle fixed pricing correctly', async () => {
    // Mock product to be fixed price
    mockProductLookup.mockResolvedValue({
      data: [fixedProduct],
      error: null,
    });

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
        ignoreDuplicates: true,
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
    mockProductLookup.mockResolvedValue({
      data: [seatBasedProduct],
      error: null,
    });

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

  it('should sync the embedded Polar product when subscription product rows are stale', async () => {
    mockProductLookup.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await syncSubscriptionToDatabase(mockSupabase, {
      ...mockSubscription,
      product: embeddedSeatBasedPolarProduct,
    } as unknown as Subscription);

    expect(result.isSeatBased).toBe(true);
    expect(result.subscriptionData!.seat_count).toBe(5);
    expect(mockProductUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'prod_123',
          tier: 'PRO',
          pricing_model: 'seat_based',
          price_per_seat: 1000,
        }),
      ],
      {
        onConflict: 'id',
        ignoreDuplicates: false,
      }
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          product_id: 'prod_123',
          seat_count: 5,
        }),
      ],
      {
        onConflict: 'polar_subscription_id',
        ignoreDuplicates: true,
      }
    );
  });

  it('should report ambiguous subscription product rows explicitly', async () => {
    mockProductLookup.mockResolvedValue({
      data: [seatBasedProduct, fixedProduct],
      error: null,
    });

    await expect(
      syncSubscriptionToDatabase(mockSupabase, mockSubscription)
    ).rejects.toThrow(
      'Subscription product lookup error for prod_123: multiple product rows matched'
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
