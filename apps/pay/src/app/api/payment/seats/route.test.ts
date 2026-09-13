import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), update: vi.fn() }));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mocks.resolve,
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({ subscriptions: { update: mocks.update } }),
}));

import { POST } from './route';

function request(newSeatCount: unknown) {
  return POST(
    new Request('https://pay.tuturuuu.com/api/payment/seats', {
      method: 'POST',
      body: JSON.stringify({ wsId: 'workspace', newSeatCount }),
    })
  );
}
function actor({
  pending = 1,
  emailPending = 1,
  currentSeats = 5,
  minSeats = 1,
}: {
  pending?: number | null;
  emailPending?: number | null;
  currentSeats?: number | null;
  minSeats?: number | null;
} = {}) {
  const localUpdate = vi.fn();
  const from = vi.fn((table: string) => {
    const result =
      table === 'workspaces'
        ? { data: { creator_id: 'user' } }
        : table === 'workspace_subscriptions'
          ? {
              data: {
                id: 'sub',
                product_id: 'product',
                polar_subscription_id: 'polar-sub',
                seat_count: currentSeats,
              },
            }
          : table === 'workspace_subscription_products'
            ? {
                data: {
                  pricing_model: 'seat_based',
                  min_seats: minSeats,
                  max_seats: null,
                  price_per_seat: 900,
                },
              }
            : {
                count:
                  table === 'workspace_members'
                    ? 2
                    : table === 'workspace_invites'
                      ? pending
                      : emailPending,
                error: null,
              };
    const query = Object.assign(Promise.resolve(result), {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      single: vi.fn(async () => result),
      maybeSingle: vi.fn(async () => result),
      update: localUpdate,
    });
    for (const key of [
      'select',
      'eq',
      'in',
      'order',
      'limit',
      'update',
    ] as const)
      query[key].mockReturnValue(query);
    return query;
  });
  mocks.resolve.mockResolvedValue({
    user: { id: 'user' },
    admin: { from, schema: () => ({ from }) },
  });
  return { localUpdate };
}

describe('seat mutation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ id: 'polar-sub' });
  });
  it.each(['2', 1.5, 0, -1, 1001, null])(
    'rejects invalid seat quantity %s before contacting billing',
    async (quantity) => {
      expect((await request(quantity)).status).toBe(400);
      expect(mocks.resolve).not.toHaveBeenCalled();
    }
  );
  it('rejects a reduction below members and both reserved invitation types', async () => {
    const f = actor();
    expect((await request(3)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(f.localUpdate).not.toHaveBeenCalled();
  });
  it('fails closed on unknown reservation counts, purchased capacity, or plan bounds', async () => {
    for (const config of [
      { pending: null },
      { emailPending: null },
      { pending: -1 },
      { currentSeats: null },
      { minSeats: null },
    ]) {
      actor(config);
      expect((await request(5)).status).toBe(503);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('updates only the quantity and keeps the existing price and discount untouched', async () => {
    const f = actor();
    expect((await request(4)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      id: 'polar-sub',
      subscriptionUpdate: { seats: 4, prorationBehavior: 'invoice' },
    });
    expect(f.localUpdate).toHaveBeenCalledWith({ seat_count: 4 });
  });
});
