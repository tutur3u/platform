import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveUser: vi.fn(),
  membership: vi.fn(),
  permissions: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveUser,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { GET } from './route';

describe('workspace mention directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.resolveUser.mockResolvedValue({
      user: { id: 'actor-1' },
      authError: null,
    });
    mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
    mocks.permissions.mockResolvedValue({ containsPermission: () => false });
  });

  const call = () =>
    GET(new Request('https://example.invalid/api/v1/workspaces/ws-1/Mention'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

  it('denies a member without private profile permission before data access', async () => {
    expect((await call()).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('denies a guest before privileged access', async () => {
    mocks.membership.mockResolvedValue({ ok: false, membershipType: 'GUEST' });
    expect((await call()).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('preserves lookup failures as server errors', async () => {
    mocks.membership.mockResolvedValue({
      ok: false,
      error: 'membership_lookup_failed',
    });
    expect((await call()).status).toBe(500);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('requires a verified actor', async () => {
    mocks.resolveUser.mockResolvedValue({
      user: null,
      authError: new Error('synthetic'),
    });
    expect((await call()).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns only the workspace-scoped email directory when permitted', async () => {
    mocks.permissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'view_users_private_info',
    });
    const eq = vi.fn().mockResolvedValue({
      data: [{ email: 'synthetic@example.invalid' }],
      error: null,
    });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createAdminClient.mockResolvedValue({ from });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      email: ['synthetic@example.invalid'],
    });
    expect(from).toHaveBeenCalledWith('workspace_users');
    expect(select).toHaveBeenCalledWith('email');
    expect(eq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });
});
