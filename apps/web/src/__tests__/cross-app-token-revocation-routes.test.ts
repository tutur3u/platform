import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const rpc = vi.fn(async (_fn: string, _args: unknown) => {
    calls.push('rpc');
    return { error: null as { message: string } | null };
  });
  const signOut = vi.fn(async (_options: unknown) => {
    calls.push('signOut');
    return { error: null };
  });
  const updateUser = vi.fn();
  // No getUser: the routes must use the session user they already resolved.
  const supabase = { auth: { signOut, updateUser }, rpc };

  return {
    calls,
    resolveAuthenticatedSessionUser: vi.fn(),
    revokeUserAiTempAuthTokens: vi.fn(async (_userId: string) => {
      calls.push('aiTempAuth');
    }),
    rpc,
    signOut,
    supabase,
    updateUser,
  };
});

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

function passwordRequest() {
  return new NextRequest('http://localhost/api/v1/users/me/password', {
    body: JSON.stringify({ password: 'Password1!' }),
    method: 'POST',
  });
}

describe('cross-app token revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes AI temp auth and cross-app tokens before signing out', async () => {
      const { POST } = await import('@/legacy-api-routes/auth/logout/route');

      const response = await POST();

      expect(response.status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledWith('revoke_all_cross_app_tokens', {
        p_user_id: 'user-1',
      });
      expect(mocks.revokeUserAiTempAuthTokens).toHaveBeenCalledWith('user-1');
      expect(mocks.calls.at(-1)).toBe('signOut');
    });

    it('still signs out when AI temp-auth revocation rejects', async () => {
      mocks.revokeUserAiTempAuthTokens.mockRejectedValueOnce(
        new Error('redis down')
      );
      const { POST } = await import('@/legacy-api-routes/auth/logout/route');

      const response = await POST();

      expect(response.status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalled();
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('still signs out when cross-app revocation fails', async () => {
      mocks.rpc.mockResolvedValueOnce({ error: { message: 'unavailable' } });
      const { POST } = await import('@/legacy-api-routes/auth/logout/route');

      const response = await POST();

      expect(response.status).toBe(200);
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('skips revocation when there is no signed-in user', async () => {
      mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
      const { POST } = await import('@/legacy-api-routes/auth/logout/route');

      await POST();

      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.revokeUserAiTempAuthTokens).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/users/me/password', () => {
    it('revokes cross-app tokens for the session user after a successful change', async () => {
      mocks.updateUser.mockResolvedValue({ error: null });
      const route = await import(
        '@/legacy-api-routes/v1/users/me/password/route'
      );

      const response = await (route.POST as any)(passwordRequest(), {
        supabase: mocks.supabase,
        user: { id: 'user-1' },
      });

      expect(response.status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledWith('revoke_all_cross_app_tokens', {
        p_user_id: 'user-1',
      });
    });

    it('reports success when the password changed but revocation failed', async () => {
      mocks.updateUser.mockResolvedValue({ error: null });
      mocks.rpc.mockResolvedValueOnce({ error: { message: 'unavailable' } });
      const route = await import(
        '@/legacy-api-routes/v1/users/me/password/route'
      );

      const response = await (route.POST as any)(passwordRequest(), {
        supabase: mocks.supabase,
        user: { id: 'user-1' },
      });

      expect(response.status).toBe(200);
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

      const response = await (route.POST as any)(passwordRequest(), {
        supabase: mocks.supabase,
        user: { id: 'user-1' },
      });

      expect(response.status).toBe(409);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });
});
