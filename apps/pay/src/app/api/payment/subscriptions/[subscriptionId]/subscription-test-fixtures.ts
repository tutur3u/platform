import { vi } from 'vitest';

export function adminFixture({
  subscription = true,
  model = 'seat_based',
  count = 1,
  pendingInvites = 0,
  pendingEmailInvites = 0,
  targetTier = 'PLUS',
  currentTier = 'PLUS',
  currentMissing = false,
  currentModel,
  currentSeats = 1,
  minSeats = 1,
  maxSeats = null,
}: {
  subscription?: boolean;
  model?: string;
  count?: number | null;
  pendingInvites?: number | null;
  pendingEmailInvites?: number | null;
  targetTier?: string;
  currentTier?: string;
  currentMissing?: boolean;
  currentModel?: string | null;
  currentSeats?: number | null;
  minSeats?: number | null;
  maxSeats?: number | null;
} = {}) {
  const now = Date.now();
  const queries: Record<string, ReturnType<typeof vi.fn>> = {};
  const from = vi.fn((table: string) => {
    let queriedId: unknown;
    const result =
      table === 'workspaces'
        ? { data: { id: 'workspace', personal: true } }
        : table === 'workspace_subscriptions'
          ? {
              data: subscription
                ? {
                    id: 'sub',
                    ws_id: 'workspace',
                    polar_subscription_id: 'polar-sub',
                    product_id: 'current-product',
                    seat_count: currentSeats,
                    current_period_start: new Date(
                      now - 10 * 86400000
                    ).toISOString(),
                    current_period_end: new Date(
                      now + 20 * 86400000
                    ).toISOString(),
                  }
                : null,
            }
          : {
              count:
                table === 'workspace_invites'
                  ? pendingInvites
                  : table === 'workspace_email_invites'
                    ? pendingEmailInvites
                    : count,
              error: null,
            };
    const query = Object.assign(Promise.resolve(result), {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => {
        if (table !== 'workspace_subscription_products') return result;
        if (queriedId === 'current-product')
          return {
            data: currentMissing
              ? null
              : {
                  id: 'current-product',
                  name: 'Current',
                  tier: currentTier,
                  pricing_model:
                    currentModel === undefined
                      ? currentTier === 'FREE'
                        ? 'free'
                        : 'seat_based'
                      : currentModel,
                  price: 0,
                  price_per_seat: 800,
                  recurring_interval: 'month',
                },
          };
        if (queriedId === 'product')
          return {
            data: {
              id: 'product',
              name: 'Target',
              tier: targetTier,
              pricing_model: model,
              archived: false,
              price: 0,
              price_per_seat: 900,
              min_seats: minSeats,
              max_seats: maxSeats,
              recurring_interval: 'month',
            },
          };
        return { data: null };
      }),
    });
    query.select.mockReturnValue(query);
    query.eq.mockImplementation((field: string, value: unknown) => {
      if (field === 'id') queriedId = value;
      return query;
    });
    queries[table] = query.eq;
    return query;
  });
  return {
    admin: {
      from,
      schema: () => ({ from }),
      rpc: vi.fn(async () => ({ data: true, error: null })),
    },
    queries,
  };
}
