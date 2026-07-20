import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkWorkspaceCreationLimit: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getAppSessionUserFromRequest: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionUserFromRequest: mocks.getAppSessionUserFromRequest,
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: vi.fn(),
}));

vi.mock('@tuturuuu/payment-core/customer-helper', () => ({
  getOrCreatePolarCustomer: vi.fn(),
}));

vi.mock('@tuturuuu/payment-core/subscription-helper', () => ({
  createFreeSubscription: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-limits', () => ({
  checkWorkspaceCreationLimit: mocks.checkWorkspaceCreationLimit,
}));

describe('POST /api/v1/workspaces/team authentication', () => {
  const supabase = { client: 'session' };
  const admin = { client: 'admin' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(supabase);
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.checkWorkspaceCreationLimit.mockResolvedValue({
      canCreate: false,
      errorCode: 'WORKSPACE_LIMIT_REACHED',
      errorMessage: 'Workspace limit reached',
    });
  });

  it('accepts a signed satellite app session and uses the admin database client', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
    mocks.getAppSessionUserFromRequest.mockReturnValue({
      email: 'satellite@example.com',
      id: 'satellite-user',
    });
    const { POST } = await import('./route');

    const request = new Request('https://tuturuuu.com/api/v1/workspaces/team', {
      body: JSON.stringify({ name: 'Satellite workspace' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.getAppSessionUserFromRequest).toHaveBeenCalledWith(request);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.checkWorkspaceCreationLimit).toHaveBeenCalledWith(
      admin,
      'satellite-user',
      'satellite@example.com'
    );
  });

  it('keeps direct web sessions on their RLS-bound database client', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { email: 'web@example.com', id: 'web-user' },
    });
    const { POST } = await import('./route');

    const response = await POST(
      new Request('https://tuturuuu.com/api/v1/workspaces/team', {
        body: JSON.stringify({ name: 'Web workspace' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.checkWorkspaceCreationLimit).toHaveBeenCalledWith(
      supabase,
      'web-user',
      'web@example.com'
    );
  });

  it('returns unauthorized when neither session mechanism resolves a user', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
    mocks.getAppSessionUserFromRequest.mockReturnValue(null);
    const { POST } = await import('./route');

    const response = await POST(
      new Request('https://tuturuuu.com/api/v1/workspaces/team', {
        body: JSON.stringify({ name: 'Denied workspace' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.checkWorkspaceCreationLimit).not.toHaveBeenCalled();
  });
});
