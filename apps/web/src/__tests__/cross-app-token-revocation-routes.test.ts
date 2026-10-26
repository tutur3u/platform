import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const signOut = vi.fn(async () => {
    calls.push('signOut');
    return { error: null };
  });
  const updateUser = vi.fn();
  const supabase = { auth: { signOut, updateUser } };

  return {
    calls,
    resolveAuthenticatedSessionUser: vi.fn(),
    revokeAllCrossAppTokens: vi.fn(async (_supabase: unknown) => {
      calls.push('revokeAllCrossAppTokens');
      return true;
    }),
    revokeUserAiTempAuthTokens: vi.fn(async (_userId: string) => undefined),
    signOut,
    supabase,
    updateUser,
  };
});

vi.mock('@tuturuuu/auth/cross-app', () => ({
  revokeAllCrossAppTokens: (supabase: unknown) =>
    mocks.revokeAllCrossAppTokens(supabase),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => mocks.supabase,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (supabase: unknown) =>
    mocks.resolveAuthenticatedSessionUser(supabase),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  revokeUserAiTempAuthTokens: (userId: string) =>
    mocks.revokeUserAiTempAuthTokens(userId),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

describe('cross-app token revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
  });

  it('revokes cross-app tokens on logout before the session is signed out', async () => {
    const { POST } = await import('@/legacy-api-routes/auth/logout/route');

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.revokeAllCrossAppTokens).toHaveBeenCalledWith(mocks.supabase);
    expect(mocks.calls).toEqual(['revokeAllCrossAppTokens', 'signOut']);
  });

  it('still signs out when revocation fails', async () => {
    mocks.revokeAllCrossAppTokens.mockResolvedValueOnce(false);
    const { POST } = await import('@/legacy-api-routes/auth/logout/route');

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('skips revocation when there is no signed-in user', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
    const { POST } = await import('@/legacy-api-routes/auth/logout/route');

    await POST();

    expect(mocks.revokeAllCrossAppTokens).not.toHaveBeenCalled();
  });

  it('revokes cross-app tokens after a successful password change', async () => {
    mocks.updateUser.mockResolvedValue({ error: null });
    const route = await import(
      '@/legacy-api-routes/v1/users/me/password/route'
    );

    const response = await (route.POST as any)(
      new NextRequest('http://localhost/api/v1/users/me/password', {
        body: JSON.stringify({ password: 'Password1!' }),
        method: 'POST',
      }),
      { supabase: mocks.supabase, user: { id: 'user-1' } }
    );

    expect(response.status).toBe(200);
    expect(mocks.revokeAllCrossAppTokens).toHaveBeenCalledWith(mocks.supabase);
  });

  it('does not revoke when the password change is refused', async () => {
    mocks.updateUser.mockResolvedValue({
      error: {
        code: 'reauthentication_needed',
        message: 'reauthentication_needed',
      },
    });
    const route = await import(
      '@/legacy-api-routes/v1/users/me/password/route'
    );

    const response = await (route.POST as any)(
      new NextRequest('http://localhost/api/v1/users/me/password', {
        body: JSON.stringify({ password: 'Password1!' }),
        method: 'POST',
      }),
      { supabase: mocks.supabase, user: { id: 'user-1' } }
    );

    expect(response.status).toBe(409);
    expect(mocks.revokeAllCrossAppTokens).not.toHaveBeenCalled();
  });
});
