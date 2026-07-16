import { describe, expect, it, vi } from 'vitest';
import { resolveAuthenticatedSessionUser } from './app-session-user';

describe('resolveAuthenticatedSessionUser', () => {
  it('revalidates mobile bearer sessions with the provided Supabase client', async () => {
    const user = {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00.000Z',
      email: 'mobile@tuturuuu.com',
      id: 'mobile-user',
      identities: [],
      is_anonymous: false,
      role: 'authenticated',
      user_metadata: {},
    };
    const mockClient = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: user.id } },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: null,
        }),
      },
    };
    const request = {
      headers: new Headers({
        authorization: 'Bearer header.payload.signature',
      }),
    };

    const result = await resolveAuthenticatedSessionUser(
      request,
      mockClient as never
    );

    expect(result.authError).toBeNull();
    expect(result.supabase).toBe(mockClient);
    expect(result.user?.id).toBe(user.id);
    expect(mockClient.auth.getUser).toHaveBeenCalledTimes(1);
  });
});
