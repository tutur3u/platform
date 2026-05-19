import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthenticatedSessionUser } from '../auth-session-user';

type TestUser = {
  app_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
  email?: string;
  id: string;
  identities: unknown[];
  is_anonymous: boolean;
  phone?: string;
  role: string;
  updated_at?: string;
  user_metadata: Record<string, unknown>;
};

function createClaims(overrides: Record<string, unknown> = {}) {
  return {
    app_metadata: {},
    aud: 'authenticated',
    email: 'stale@tuturuuu.com',
    iat: 1_700_000_000,
    role: 'authenticated',
    sub: 'user-123',
    user_metadata: {},
    ...overrides,
  };
}

function createAuthServerUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00.000Z',
    email: 'current@tuturuuu.com',
    id: 'user-123',
    identities: [],
    is_anonymous: false,
    role: 'authenticated',
    updated_at: '2024-01-02T00:00:00.000Z',
    user_metadata: {},
    ...overrides,
  };
}

describe('resolveAuthenticatedSessionUser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revalidates JWT claims with the Auth server before returning a user', async () => {
    const serverUser = createAuthServerUser();
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: createClaims({
              created_at: '1999-01-01T00:00:00.000Z',
              email: 'offboarded.admin@tuturuuu.com',
            }),
          },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: serverUser },
          error: null,
        }),
      },
    };

    const { authError, user } = await resolveAuthenticatedSessionUser(
      supabase as never
    );

    expect(authError).toBeNull();
    expect(supabase.auth.getClaims).toHaveBeenCalledTimes(1);
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
    expect(user?.id).toBe('user-123');
    expect(user?.email).toBe('current@tuturuuu.com');
    expect(user?.created_at).toBe('2024-01-01T00:00:00.000Z');
    expect(user?.updated_at).toBe('2024-01-02T00:00:00.000Z');
  });

  it('rejects valid stale claims when the Auth server rejects the session', async () => {
    const authError = Object.assign(
      new Error('Auth server says this session is no longer valid'),
      { status: 401 }
    );
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: createClaims({
              email: 'offboarded.admin@tuturuuu.com',
            }),
          },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: authError,
        }),
      },
    };

    const result = await resolveAuthenticatedSessionUser(supabase as never);

    expect(result.user).toBeNull();
    expect(result.authError).toBe(authError);
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it('falls back to getUser when getClaims is unavailable', async () => {
    const serverUser = createAuthServerUser({ id: 'fallback-user' });
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: serverUser },
          error: null,
        }),
      },
    };

    const { authError, user } = await resolveAuthenticatedSessionUser(
      supabase as never
    );

    expect(authError).toBeNull();
    expect(user?.id).toBe('fallback-user');
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });
});
