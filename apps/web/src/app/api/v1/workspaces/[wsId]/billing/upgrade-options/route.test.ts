import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const USER = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const PLUS_MONTH = 'f6a4a2f9-0a9a-4f0b-9b44-4a1f5b5d6a01';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  canManage: vi.fn(),
  catalog: vi.fn(),
  subscription: vi.fn(),
  productById: vi.fn(),
  publicIds: [] as string[],
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: vi.fn() };
});
vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.access,
}));
vi.mock('@/lib/pay-app-url', () => ({
  getPayBillingUrl: (wsId: string) => `https://pay.example/${wsId}/billing`,
}));
vi.mock('@tuturuuu/payment-core/billing-helper', () => ({
  checkManageSubscriptionPermission: mocks.canManage,
}));
vi.mock('@tuturuuu/payment-core/public-prices', () => ({
  activeWorkspaceCatalog: () => null,
  get PUBLIC_WORKSPACE_PRODUCT_IDS() {
    return mocks.publicIds;
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: mocks.subscription }),
            }),
          }),
        }),
      }),
    }),
    schema: () => ({
      from: () => ({
        select: (columns: string) =>
          columns.includes('archived')
            ? { eq: mocks.catalog }
            : { eq: () => ({ maybeSingle: mocks.productById }) },
      }),
    }),
  })),
}));

import { GET } from './route';

const params = { params: Promise.resolve({ wsId: 'personal' }) };
const call = () => GET(new Request('http://localhost/api'), params);

const row = (over: Record<string, unknown>) => ({
  archived: false,
  description: null,
  id: 'p',
  max_seats: null,
  min_seats: null,
  name: 'Plan',
  price: 0,
  price_per_seat: null,
  pricing_model: 'seat_based',
  recurring_interval: 'month',
  tier: 'PLUS',
  ...over,
});

describe('workspace upgrade options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicIds = [PLUS_MONTH];
    mocks.access.mockResolvedValue({
      ok: true,
      user: { id: USER },
      permissions: { wsId: WS },
    });
    mocks.canManage.mockResolvedValue(true);
    mocks.catalog.mockResolvedValue({
      data: [
        row({ id: 'free', name: 'Free', pricing_model: 'free', tier: 'FREE' }),
        row({
          id: 'free-2',
          name: 'Free again',
          pricing_model: 'free',
          tier: 'FREE',
        }),
        row({ id: PLUS_MONTH, name: 'Plus', price_per_seat: 500 }),
        row({
          id: 'legacy',
          name: 'Legacy',
          pricing_model: 'fixed',
          price: 900,
        }),
        row({ id: 'hidden', name: 'Unlisted', price_per_seat: 700 }),
      ],
      error: null,
    });
    mocks.subscription.mockResolvedValue({ data: null, error: null });
  });

  it('returns the access failure untouched', async () => {
    mocks.access.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'nope' }, { status: 401 }),
    });
    expect((await call()).status).toBe(401);
    expect(mocks.canManage).not.toHaveBeenCalled();
  });

  it('requires the manage_subscription permission', async () => {
    mocks.canManage.mockResolvedValue(false);
    const response = await call();
    expect(response.status).toBe(403);
    expect(mocks.canManage).toHaveBeenCalledWith(expect.anything(), WS, USER);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it('lists only one Free plan and the publicly listed paid plans', async () => {
    const body = await (await call()).json();
    expect(body.billingUrl).toBe(`https://pay.example/${WS}/billing`);
    expect(body.currentPlan).toBeNull();
    expect(body.plans.map((plan: { id: string }) => plan.id)).toEqual([
      'free',
      PLUS_MONTH,
    ]);
    expect(body.plans[1]).toMatchObject({
      billingCycle: 'month',
      pricePerSeat: 500,
      tier: 'PLUS',
    });
  });

  it('reports the active subscription as the current plan', async () => {
    mocks.subscription.mockResolvedValue({
      data: {
        cancel_at_period_end: true,
        current_period_end: '2026-12-01T00:00:00Z',
        product_id: PLUS_MONTH,
        seat_count: 4,
        status: 'active',
      },
      error: null,
    });
    const body = await (await call()).json();
    expect(body.currentPlan).toEqual({
      billingCycle: 'month',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: '2026-12-01T00:00:00Z',
      name: 'Plus',
      productId: PLUS_MONTH,
      seatCount: 4,
      status: 'active',
      tier: 'PLUS',
    });
  });

  it('falls back to a product lookup for a retired current plan', async () => {
    mocks.subscription.mockResolvedValue({
      data: {
        cancel_at_period_end: false,
        current_period_end: null,
        product_id: 'retired',
        seat_count: null,
        status: 'active',
      },
      error: null,
    });
    mocks.productById.mockResolvedValue({
      data: {
        id: 'retired',
        name: 'Old',
        recurring_interval: 'year',
        tier: 'PRO',
      },
    });
    const body = await (await call()).json();
    expect(body.currentPlan).toMatchObject({
      name: 'Old',
      billingCycle: 'year',
    });
  });

  it('answers 500 without leaking the failure', async () => {
    mocks.catalog.mockResolvedValue({
      data: null,
      error: new Error('db down'),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('db down');
  });
});
