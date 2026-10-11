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

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }

  function checkedAuth() {
    const stop = new Error('fixed-safe-stop');
    let stopped = false;
    const check = vi.fn(() => {
      if (stopped) throw stop;
    });
    const supabase = {
      auth: {
        getClaims: vi
          .fn()
          .mockResolvedValue({ data: { claims: createClaims() }, error: null }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: createAuthServerUser() },
          error: null,
        }),
      },
    };
    return {
      supabase,
      check,
      stop,
      stopNow: () => {
        stopped = true;
      },
    };
  }

  it('prevents both SDK dispatches when already stopped', async () => {
    const context = checkedAuth();
    context.stopNow();
    await expect(
      resolveAuthenticatedSessionUser(context.supabase as never, {
        check: context.check,
      })
    ).rejects.toBe(context.stop);
    expect(context.supabase.auth.getClaims).not.toHaveBeenCalled();
    expect(context.supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it.each(['fulfill', 'reject'] as const)(
    'checks late claims %s before data inspection or fallback',
    async (outcome) => {
      const context = checkedAuth();
      const pending = deferred<unknown>();
      const inspect = vi.fn(() => {
        throw new Error('private-claims-sentinel');
      });
      context.supabase.auth.getClaims.mockReturnValue(pending.promise);
      const result = resolveAuthenticatedSessionUser(
        context.supabase as never,
        { check: context.check }
      );
      const rejected = expect(result).rejects.toBe(context.stop);
      expect(context.supabase.auth.getClaims).toHaveBeenCalledTimes(1);
      context.stopNow();
      if (outcome === 'fulfill')
        pending.resolve({
          get data() {
            return inspect();
          },
        });
      else pending.reject(new Error('private-rejection-sentinel'));
      await rejected;
      expect(inspect).not.toHaveBeenCalled();
      expect(context.supabase.auth.getUser).not.toHaveBeenCalled();
    }
  );

  it('does not swallow a stop thrown at the claims fulfillment checkpoint', async () => {
    const context = checkedAuth();
    context.check
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw context.stop;
      });
    await expect(
      resolveAuthenticatedSessionUser(context.supabase as never, {
        check: context.check,
      })
    ).rejects.toBe(context.stop);
    expect(context.supabase.auth.getClaims).toHaveBeenCalledTimes(1);
    expect(context.supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it.each(['reject', 'throw', 'error result'] as const)(
    'allows in-budget claims %s to fall back to authoritative getUser',
    async (outcome) => {
      const context = checkedAuth();
      const privateError = new Error('private-error-sentinel');
      if (outcome === 'throw')
        context.supabase.auth.getClaims.mockImplementation(() => {
          throw privateError;
        });
      else if (outcome === 'reject')
        context.supabase.auth.getClaims.mockRejectedValue(privateError);
      else
        context.supabase.auth.getClaims.mockResolvedValue({
          data: null,
          error: privateError,
        });
      const result = await resolveAuthenticatedSessionUser(
        context.supabase as never,
        { check: context.check }
      );
      expect(result.user?.email).toBe('current@tuturuuu.com');
      expect(result.authError).toBeNull();
      expect(context.supabase.auth.getUser).toHaveBeenCalledWith();
    }
  );

  it('checks immediately before authoritative dispatch even without claims', async () => {
    const context = checkedAuth();
    const supabase = { auth: { getUser: context.supabase.auth.getUser } };
    context.check
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw context.stop;
      });
    await expect(
      resolveAuthenticatedSessionUser(supabase as never, {
        check: context.check,
      })
    ).rejects.toBe(context.stop);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it.each(['fulfill', 'reject'] as const)(
    'checks late getUser %s before classification',
    async (outcome) => {
      const context = checkedAuth();
      const pending = deferred<unknown>();
      const dispatched = deferred<void>();
      const inspect = vi.fn(() => {
        throw new Error('private-user-sentinel');
      });
      context.supabase.auth.getUser.mockImplementation(() => {
        dispatched.resolve();
        return pending.promise;
      });
      const result = resolveAuthenticatedSessionUser(
        context.supabase as never,
        { check: context.check }
      );
      const rejected = expect(result).rejects.toBe(context.stop);
      await dispatched.promise;
      context.stopNow();
      if (outcome === 'fulfill')
        pending.resolve({
          get data() {
            return inspect();
          },
        });
      else pending.reject(new Error('private-user-error-sentinel'));
      await rejected;
      expect(inspect).not.toHaveBeenCalled();
      expect(context.supabase.auth.getUser).toHaveBeenCalledTimes(1);
    }
  );

  it('returns the authoritative denial despite valid stale scoped claims', async () => {
    const context = checkedAuth();
    const denial = Object.assign(new Error('safe-denial'), { status: 401 });
    context.supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: denial,
    });
    const result = await resolveAuthenticatedSessionUser(
      context.supabase as never,
      { check: context.check }
    );
    expect(result).toEqual({ user: null, authError: denial });
    expect(context.supabase.auth.getClaims).toHaveBeenCalledWith();
    expect(context.supabase.auth.getUser).toHaveBeenCalledWith();
  });

  it('preserves an in-budget authoritative rejection', async () => {
    const context = checkedAuth();
    const failure = new Error('private-authoritative-sentinel');
    context.supabase.auth.getUser.mockRejectedValue(failure);
    await expect(
      resolveAuthenticatedSessionUser(context.supabase as never, {
        check: context.check,
      })
    ).rejects.toBe(failure);
  });

  it.each(['success', 'claims rejection', 'user rejection'] as const)(
    'suppresses every scoped auth log for %s',
    async (outcome) => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const context = checkedAuth();
      context.supabase.auth.getClaims.mockResolvedValue({
        data: { claims: createClaims({ sub: 'private-identity-sentinel' }) },
        error: null,
      });
      if (outcome === 'claims rejection')
        context.supabase.auth.getClaims.mockRejectedValue(
          new Error('private-token-sentinel')
        );
      if (outcome === 'user rejection')
        context.supabase.auth.getUser.mockRejectedValue(
          new Error('private-error-sentinel')
        );
      const result = resolveAuthenticatedSessionUser(
        context.supabase as never,
        { check: context.check }
      );
      if (outcome === 'user rejection')
        await expect(result).rejects.toThrow('private-error-sentinel');
      else await result;
      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    }
  );

  it('preserves the unscoped optional-claims warning and fallback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const context = checkedAuth();
    context.supabase.auth.getClaims.mockRejectedValue(
      new Error('control-rejection')
    );
    const result = await resolveAuthenticatedSessionUser(
      context.supabase as never
    );
    expect(result.user?.id).toBe('user-123');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('falling back to getUser')
    );
    expect(context.check).not.toHaveBeenCalled();
  });

  it('keeps development identity timing logs only for unscoped calls', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    try {
      const { resolveAuthenticatedSessionUser: resolveInDevelopment } =
        await import('../auth-session-user');
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const context = checkedAuth();
      await resolveInDevelopment(context.supabase as never, {
        check: context.check,
      });
      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      await resolveInDevelopment(context.supabase as never);
      expect(info).toHaveBeenCalledTimes(2);
      expect(info.mock.calls[0]?.[0]).toContain('getClaims hit:');
      expect(info.mock.calls[1]?.[0]).toContain('getUser revalidation:');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
