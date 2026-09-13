import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), create: vi.fn() }));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({ checkouts: { create: mocks.create } }),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mocks.resolve,
}));

import { POST } from './route';

function adminFixture({
  subscription = true,
  model = 'seat_based',
  count = 1,
}: {
  subscription?: boolean;
  model?: string;
  count?: number | null;
} = {}) {
  const queries: Record<string, ReturnType<typeof vi.fn>> = {};
  const from = vi.fn((table: string) => {
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
                  }
                : null,
            }
          : table === 'workspace_subscription_products'
            ? { data: { tier: 'PLUS', pricing_model: model, archived: false } }
            : { count, error: null };
    const query = Object.assign(Promise.resolve(result), {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => result),
    });
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
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
async function checkout() {
  return POST(
    new NextRequest(
      'https://pay.tuturuuu.com/api/payment/subscriptions/sub/checkouts',
      {
        method: 'POST',
        body: JSON.stringify({ wsId: 'workspace', productId: 'product' }),
      }
    ),
    { params: Promise.resolve({ subscriptionId: 'sub' }) }
  );
}

describe('workspace checkout boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ url: 'https://polar.sh/checkout/test' });
  });
  it('binds the subscription to the authorized workspace before contacting Polar', async () => {
    const f = adminFixture({ subscription: false });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await checkout()).status).toBe(404);
    expect(f.queries.workspace_subscriptions).toHaveBeenCalledWith('id', 'sub');
    expect(f.queries.workspace_subscriptions).toHaveBeenCalledWith(
      'ws_id',
      'workspace'
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('supplies one verified seat for a personal workspace', async () => {
    const f = adminFixture();
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await checkout()).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ seats: 1, metadata: { wsId: 'workspace' } })
    );
  });
  it('denies legacy fixed products and unavailable seat accounting', async () => {
    for (const config of [{ model: 'fixed' }, { count: null }, { count: 0 }]) {
      const f = adminFixture(config);
      mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
      expect((await checkout()).status).toBe(config.model ? 400 : 503);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
