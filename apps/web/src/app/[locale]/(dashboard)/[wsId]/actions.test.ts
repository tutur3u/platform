import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks for the setupWorkspace dependency graph ----------------------------
const getUser = vi.fn();
const createClient = vi.fn(async () => ({ auth: { getUser } }));
const createAdminClient = vi.fn(async () => ({}));
const createPolarClient = vi.fn(() => ({}));
const verifyWorkspaceMembershipType = vi.fn();
const isPolarWorkspaceSetupEnabled = vi.fn();
const getOrCreatePolarCustomer = vi.fn();
const createFreeSubscription = vi.fn();
const syncSubscriptionToDatabase = vi.fn();
const cookieSet = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: () => createClient(),
  createAdminClient: () => createAdminClient(),
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => createPolarClient(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    verifyWorkspaceMembershipType(...args),
}));
vi.mock('@/lib/polar-config', () => ({
  isPolarWorkspaceSetupEnabled: () => isPolarWorkspaceSetupEnabled(),
}));
vi.mock('@tuturuuu/payment-core/customer-helper', () => ({
  getOrCreatePolarCustomer: (...args: unknown[]) =>
    getOrCreatePolarCustomer(...args),
}));
vi.mock('@tuturuuu/payment-core/polar-subscription-helper', () => ({
  syncSubscriptionToDatabase: (...args: unknown[]) =>
    syncSubscriptionToDatabase(...args),
}));
vi.mock('@tuturuuu/payment-core/subscription-helper', () => ({
  createFreeSubscription: (...args: unknown[]) =>
    createFreeSubscription(...args),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet }),
}));

import { setupWorkspace } from './actions';

describe('setupWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    isPolarWorkspaceSetupEnabled.mockReturnValue(true);
  });

  it('throws when the user is not authenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(setupWorkspace('ws-1')).rejects.toThrow('Unauthorized');
  });

  it('throws when membership verification fails', async () => {
    verifyWorkspaceMembershipType.mockResolvedValue({
      ok: false,
      error: 'membership_lookup_failed',
    });
    await expect(setupWorkspace('ws-1')).rejects.toThrow('Unauthorized');
  });

  it('skips provisioning when Polar workspace setup is disabled', async () => {
    isPolarWorkspaceSetupEnabled.mockReturnValue(false);
    await expect(setupWorkspace('ws-1')).resolves.toEqual({
      success: true,
      subscriptionProvisioned: false,
    });
    expect(getOrCreatePolarCustomer).not.toHaveBeenCalled();
  });

  it('provisions and syncs the free subscription on the happy path', async () => {
    getOrCreatePolarCustomer.mockResolvedValue({ id: 'cust-1' });
    createFreeSubscription.mockResolvedValue({
      status: 'created',
      subscription: { id: 'sub-1' },
    });
    syncSubscriptionToDatabase.mockResolvedValue({});

    await expect(setupWorkspace('ws-1')).resolves.toEqual({
      success: true,
      subscriptionProvisioned: true,
    });
    expect(syncSubscriptionToDatabase).toHaveBeenCalledTimes(1);
  });

  it('does not throw and reports unprovisioned when free subscription errors', async () => {
    getOrCreatePolarCustomer.mockResolvedValue({ id: 'cust-1' });
    createFreeSubscription.mockResolvedValue({
      status: 'error',
      message: 'No free tier product found',
    });

    await expect(setupWorkspace('ws-1')).resolves.toEqual({
      success: true,
      subscriptionProvisioned: false,
    });
    expect(syncSubscriptionToDatabase).not.toHaveBeenCalled();
  });

  it('does not throw when the Polar customer call throws', async () => {
    getOrCreatePolarCustomer.mockRejectedValue(new Error('Polar 500'));

    await expect(setupWorkspace('ws-1')).resolves.toEqual({
      success: true,
      subscriptionProvisioned: false,
    });
  });

  it('does not throw when subscription sync throws', async () => {
    getOrCreatePolarCustomer.mockResolvedValue({ id: 'cust-1' });
    createFreeSubscription.mockResolvedValue({
      status: 'already_active',
      subscription: { id: 'sub-1' },
    });
    syncSubscriptionToDatabase.mockRejectedValue(new Error('db down'));

    await expect(setupWorkspace('ws-1')).resolves.toEqual({
      success: true,
      subscriptionProvisioned: false,
    });
  });
});
