import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const signOut = vi.fn();
  return {
    signOut,
    client: { auth: { signOut } },
    resolve: vi.fn(),
    revoke: vi.fn(),
  };
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: () => mocks.client,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolve,
}));
vi.mock('@/lib/auth/sign-out-credentials', () => ({
  revokeSignOutCredentials: mocks.revoke,
}));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ user: { id: 'fixture-current-account' } });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.revoke.mockResolvedValue(undefined);
});

describe('current-account browser logout', () => {
  it('uses local scope and the verified current account, not global or all-account logout', async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.revoke).toHaveBeenCalledWith(
      'fixture-current-account',
      mocks.client
    );
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
  });

  it('reports a failed local sign-out instead of claiming success', async () => {
    mocks.signOut.mockResolvedValue({ error: { message: 'Fixture failure' } });
    const response = await POST();
    expect(response.status).toBe(500);
    expect((await response.json()).success).not.toBe(true);
  });
});
