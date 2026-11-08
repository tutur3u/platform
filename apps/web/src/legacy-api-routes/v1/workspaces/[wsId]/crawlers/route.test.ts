import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveAuthenticatedSessionUser: vi.fn(),
  getVerifiedAuthUser: vi.fn(),
  insert: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));
vi.mock('@tuturuuu/supabase/next/user', () => ({
  getVerifiedAuthUser: mocks.getVerifiedAuthUser,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
      insert: mocks.insert,
    }),
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/workspace-api-key', () => ({
  validateWorkspaceApiKey: vi.fn(),
}));

import { POST } from './route';

const request = () =>
  new Request('http://localhost/api/v1/workspaces/root/crawlers', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com' }),
  });

describe('workspace crawlers POST staff gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('returns 401 without reading admin state when there is no session user', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.getVerifiedAuthUser).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('returns 403 when the verified identity is not staff', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mocks.getVerifiedAuthUser.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('denies a verified staff identity without the ai_lab permission', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mocks.getVerifiedAuthUser.mockResolvedValue({
      id: 'user-1',
      email: 'staff@tuturuuu.com',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'email', identity_data: {} }],
    });
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => true });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('creates the crawler for a verified staff identity', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mocks.getVerifiedAuthUser.mockResolvedValue({
      id: 'user-1',
      email: 'staff@tuturuuu.com',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'email', identity_data: {} }],
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({
      url: 'https://example.com/',
      creator_id: 'user-1',
    });
  });
});
