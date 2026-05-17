import { describe, expect, it, vi } from 'vitest';
import { resolveAuthenticatedSessionUser } from '../auth-session-user';

describe('resolveAuthenticatedSessionUser', () => {
  it('does not treat JWT issue time as account creation time', async () => {
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              app_metadata: {},
              aud: 'authenticated',
              email: 'local@tuturuuu.com',
              iat: 1_700_000_000,
              role: 'authenticated',
              sub: 'user-123',
              user_metadata: {},
            },
          },
          error: null,
        }),
        getUser: vi.fn(),
      },
    };

    const { authError, user } = await resolveAuthenticatedSessionUser(
      supabase as never
    );

    expect(authError).toBeNull();
    expect(user?.id).toBe('user-123');
    expect(user?.created_at).toBe('');
    expect(user?.updated_at).toBeUndefined();
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it('uses explicit account timestamps when claims provide them', async () => {
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              app_metadata: {},
              aud: 'authenticated',
              created_at: '2024-01-01T00:00:00.000Z',
              email: 'local@tuturuuu.com',
              role: 'authenticated',
              sub: 'user-123',
              updated_at: '2024-01-02T00:00:00.000Z',
              user_metadata: {},
            },
          },
          error: null,
        }),
        getUser: vi.fn(),
      },
    };

    const { user } = await resolveAuthenticatedSessionUser(supabase as never);

    expect(user?.created_at).toBe('2024-01-01T00:00:00.000Z');
    expect(user?.updated_at).toBe('2024-01-02T00:00:00.000Z');
  });
});
