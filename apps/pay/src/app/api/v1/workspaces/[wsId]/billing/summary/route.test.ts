import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkManageSubscriptionPermission: vi.fn(),
  createAdminClient: vi.fn(),
  createPolarClient: vi.fn(),
  fetchSubscription: vi.fn(),
  getAppSessionUserFromRequest: vi.fn(),
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionUserFromRequest: mocks.getAppSessionUserFromRequest,
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: mocks.createPolarClient,
}));
vi.mock('@tuturuuu/payment-core/billing-helper', () => ({
  checkManageSubscriptionPermission: mocks.checkManageSubscriptionPermission,
  fetchSubscription: mocks.fetchSubscription,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: mocks.isPersonalWorkspace,
}));

import { GET } from './route';

const context = { params: Promise.resolve({ wsId: 'ws-1' }) };

describe('GET workspace billing summary', () => {
  beforeEach(() => {
    mocks.createAdminClient.mockResolvedValue({ id: 'admin' });
    mocks.createPolarClient.mockReturnValue({ id: 'polar' });
    mocks.getAppSessionUserFromRequest.mockReturnValue({ id: 'user-1' });
    mocks.checkManageSubscriptionPermission.mockResolvedValue(true);
    mocks.isPersonalWorkspace.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an authenticated user', async () => {
    mocks.getAppSessionUserFromRequest.mockReturnValue(null);

    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 403 without workspace billing permission', async () => {
    mocks.checkManageSubscriptionPermission.mockResolvedValue(false);

    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'FORBIDDEN' });
  });

  it('returns a null subscription when no subscription exists', async () => {
    mocks.isPersonalWorkspace.mockResolvedValue(true);
    mocks.fetchSubscription.mockResolvedValue(null);

    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      isPersonalWorkspace: true,
      subscription: null,
    });
  });

  it('returns only the read-only subscription summary fields', async () => {
    mocks.fetchSubscription.mockResolvedValue({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      product: {
        max_seats: 25,
        name: 'Team',
        recurring_interval: 'month',
        tier: 'PRO',
      },
      seatCount: 7,
      status: 'active',
    });

    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      isPersonalWorkspace: false,
      subscription: {
        billingCycle: 'month',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-08-01T00:00:00.000Z',
        maxSeats: 25,
        name: 'Team',
        seatCount: 7,
        status: 'active',
        tier: 'PRO',
      },
    });
  });
});
