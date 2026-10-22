import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  createAppSessionTokenPair,
  WEB_APP_SESSION_COOKIE_NAME,
} from '../app-session';
import { refreshAppSessionForRequest } from './index';

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  factor: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.admin(...args),
  createClient: vi.fn(),
}));
// The real required-MFA policy/lineage code runs against these provider fixtures.
vi.mock('@tuturuuu/supabase/next/proxy', () => ({ updateSession: vi.fn() }));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));

const start = new Date('2026-01-01T00:00:00Z');
const seconds = Math.floor(start.getTime() / 1000);
const at = (offset: number) => new Date(start.getTime() + offset * 1000);
function proof(expiresAt = seconds + 120, factorId = 'factor-a') {
  return {
    sessionId: 'session-a',
    verifiedAt: seconds - 1,
    factorId,
    expiresAt,
  };
}
function pair(
  overrides: Partial<Parameters<typeof createAppSessionTokenPair>[0]> = {},
  ttl = 60
) {
  return createAppSessionTokenPair(
    {
      userId: 'actor-a',
      targetApp: 'learn',
      mfa: proof(),
      ...overrides,
    },
    {
      now: start,
      policy: {
        internalAppAccessTtlSeconds: ttl,
        internalAppRefreshEarlySeconds: 20,
        internalAppRefreshTtlSeconds: 3600,
      },
    }
  );
}
function req(access: string, refresh?: string, bearer?: string, web?: string) {
  const headers = new Headers({
    cookie: [
      `${APP_SESSION_COOKIE_NAME}=${access}`,
      ...(refresh ? [`${APP_SESSION_REFRESH_COOKIE_NAME}=${refresh}`] : []),
      ...(web ? [`${WEB_APP_SESSION_COOKIE_NAME}=${web}`] : []),
    ].join('; '),
  });
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return new NextRequest('https://learn.example.test/dashboard', { headers });
}
const unavailable = () => new Response(null, { status: 503 });
function replacement(access: string) {
  return new Response(null, {
    headers: {
      'set-cookie': `${APP_SESSION_COOKIE_NAME}=${access}; Path=/; HttpOnly`,
    },
  });
}
function account(id: string, required = true) {
  return {
    data: {
      user: {
        id,
        app_metadata: {
          tuturuuu_required_mfa: { required, verifiedAfter: seconds - 10 },
        },
      },
    },
    error: null,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(0));
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    'synthetic-authority-test-secret'
  );
  mocks.admin.mockReset().mockResolvedValue({
    auth: { admin: { getUserById: mocks.account } },
    rpc: mocks.factor,
  });
  mocks.account
    .mockReset()
    .mockImplementation(async (id: string) => account(id));
  mocks.factor.mockReset().mockResolvedValue({ data: 'factor-a', error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('verified credential and final authority deadline', () => {
  it.each(
    ['invalid-signature', 'wrong-target', 'mfa-disallowed', 'healthy'].flatMap(
      (kind) => ['local', 'web'].map((source) => ({ kind, source }))
    )
  )(
    'keeps bearer A ahead of $source cookie B: $kind',
    async ({ kind, source }) => {
      const a = pair();
      const b =
        kind === 'invalid-signature'
          ? createAppSessionTokenPair(
              { userId: 'actor-a', targetApp: 'learn' },
              { now: start, secret: 'different-synthetic-secret' }
            )
          : pair({
              targetApp: kind === 'wrong-target' ? 'chat' : 'learn',
              mfa: proof(
                seconds + 120,
                kind === 'mfa-disallowed' ? 'removed-factor' : 'factor-a'
              ),
            });
      const request = req(
        b.access.token,
        undefined,
        a.access.token,
        source === 'web' ? b.access.token : undefined
      );
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await refreshAppSessionForRequest(request, {
        targetApp: 'learn',
      });
      expect(result).toMatchObject({
        ok: true,
        refreshed: false,
        claims: a.access.claims,
      });
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${a.access.token}`
      );
      if (result.ok) {
        expect(result.requestHeaders?.get('authorization')).toBe(
          `Bearer ${a.access.token}`
        );
        expect(
          result.response.headers.get('x-middleware-request-authorization')
        ).toBe(`Bearer ${a.access.token}`);
        expect(result.response.headers.get('set-cookie')).toBeNull();
      }
      expect(mocks.factor).toHaveBeenCalledTimes(1);
      expect(mocks.factor).toHaveBeenCalledWith(
        'account_mfa_verified_factor',
        expect.objectContaining({ p_user_id: 'actor-a' })
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('keeps the Web cookie before the local cookie and falls back only after signature rejection', async () => {
    const web = pair({ userId: 'actor-web' });
    const local = pair({ userId: 'actor-local' });
    const request = req(
      local.access.token,
      undefined,
      'invalid-bearer',
      web.access.token
    );
    const result = await refreshAppSessionForRequest(request, {
      targetApp: 'learn',
    });
    expect(result).toMatchObject({ ok: true, claims: { sub: 'actor-web' } });
    expect(request.headers.get('authorization')).toBe(
      `Bearer ${web.access.token}`
    );
    expect(mocks.account).toHaveBeenCalledTimes(1);
    expect(mocks.account).toHaveBeenCalledWith('actor-web');
  });

  it('uses verified bearer A for the refresh body and 503 fallback ahead of cookie B', async () => {
    vi.setSystemTime(at(50));
    const a = pair();
    const b = pair({ targetApp: 'chat' });
    const request = req(b.access.token, a.refresh.token, a.access.token);
    const fetchMock = vi.fn().mockResolvedValue(unavailable());
    vi.stubGlobal('fetch', fetchMock);
    const result = await refreshAppSessionForRequest(request, {
      targetApp: 'learn',
    });
    expect(result).toMatchObject({
      ok: true,
      refreshed: false,
      claims: a.access.claims,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          accessToken: a.access.token,
          refreshToken: a.refresh.token,
        }),
      })
    );
    expect(request.headers.get('authorization')).toBe(
      `Bearer ${a.access.token}`
    );
    expect(result.response?.headers.get('set-cookie')).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(1);
  });

  it('verifies healthy rotated cookies ahead of the original bearer', async () => {
    vi.setSystemTime(at(50));
    const old = pair();
    const next = pair({}, 120);
    const request = req(old.access.token, old.refresh.token, old.access.token);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(replacement(next.access.token))
    );
    const result = await refreshAppSessionForRequest(request, {
      targetApp: 'learn',
    });
    expect(result).toMatchObject({
      ok: true,
      refreshed: true,
      claims: next.access.claims,
    });
    expect(request.headers.get('authorization')).toBe(
      `Bearer ${next.access.token}`
    );
    expect(result.response?.headers.get('set-cookie')).toContain(
      next.access.token
    );
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });

  it('does not bypass current MFA by falling through from valid bearer A to healthy B', async () => {
    const a = pair({ mfa: proof(seconds + 120, 'removed-factor') });
    const b = pair();
    const request = req(b.access.token, undefined, a.access.token);
    const result = await refreshAppSessionForRequest(request, {
      targetApp: 'learn',
    });
    expect(result).toEqual({ ok: false, error: 'MFA required' });
    expect(mocks.account).toHaveBeenCalledTimes(1);
    expect(request.headers.get('authorization')).toBe(
      `Bearer ${a.access.token}`
    );
  });

  it('does not admit access expiring during current-factor lookup', async () => {
    const a = pair();
    mocks.factor.mockImplementation(async () => {
      vi.setSystemTime(at(61));
      return { data: 'factor-a', error: null };
    });
    const request = req(a.access.token);
    expect(
      await refreshAppSessionForRequest(request, { targetApp: 'learn' })
    ).toEqual({ ok: false, error: 'Token expired' });
    expect(request.headers.get('authorization')).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(1);
    expect(mocks.factor).toHaveBeenCalledTimes(1);
  });

  it('returns MFA required when required proof expires during factor lookup while access remains valid', async () => {
    const a = pair({ mfa: proof(seconds + 10) });
    mocks.factor.mockImplementation(async () => {
      vi.setSystemTime(at(11));
      return { data: 'factor-a', error: null };
    });
    const request = req(a.access.token);
    expect(
      await refreshAppSessionForRequest(request, { targetApp: 'learn' })
    ).toEqual({ ok: false, error: 'MFA required' });
    expect(a.access.claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(request.headers.get('authorization')).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(1);
    expect(mocks.factor).toHaveBeenCalledTimes(1);
  });

  it('does not extend required proof when a 503 arrives before access expires', async () => {
    vi.setSystemTime(at(50));
    const a = pair({ mfa: proof(seconds + 55) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.setSystemTime(at(56));
        return unavailable();
      })
    );
    const request = req(a.access.token, a.refresh.token);
    const cookie = request.headers.get('cookie');
    expect(
      await refreshAppSessionForRequest(request, { targetApp: 'learn' })
    ).toEqual({ ok: false, error: 'App session refresh unavailable' });
    expect(a.access.claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.headers.get('cookie')).toBe(cookie);
    expect(mocks.account).toHaveBeenCalledTimes(1);
    expect(mocks.factor).toHaveBeenCalledTimes(1);
  });

  it('does not impose the optional proof deadline on an account without required MFA', async () => {
    vi.setSystemTime(at(50));
    const a = pair({ mfa: proof(seconds + 55) });
    mocks.account.mockImplementation(async (id: string) => account(id, false));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.setSystemTime(at(56));
        return unavailable();
      })
    );
    const request = req(a.access.token, a.refresh.token);
    const result = await refreshAppSessionForRequest(request, {
      targetApp: 'learn',
    });
    expect(result).toMatchObject({ ok: true, refreshed: false });
    expect(request.headers.get('authorization')).toBe(
      `Bearer ${a.access.token}`
    );
    expect(result.response?.headers.get('set-cookie')).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(1);
    expect(mocks.factor).not.toHaveBeenCalled();
  });

  it.each(['access', 'required-proof'])(
    'checks replacement %s after its final factor await',
    async (deadline) => {
      vi.setSystemTime(at(50));
      const old = pair();
      const next = pair(
        {
          mfa: proof(
            deadline === 'required-proof' ? seconds + 55 : seconds + 120
          ),
        },
        deadline === 'access' ? 55 : 120
      );
      mocks.factor
        .mockResolvedValueOnce({ data: 'factor-a', error: null })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(at(56));
          return { data: 'factor-a', error: null };
        });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(replacement(next.access.token))
      );
      const request = req(old.access.token, old.refresh.token);
      const cookie = request.headers.get('cookie');
      expect(
        await refreshAppSessionForRequest(request, { targetApp: 'learn' })
      ).toEqual({
        ok: false,
        error: deadline === 'access' ? 'Token expired' : 'MFA required',
      });
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.headers.get('cookie')).toBe(cookie);
      expect(mocks.account).toHaveBeenCalledTimes(2);
      expect(mocks.factor).toHaveBeenCalledTimes(2);
    }
  );

  it('keeps the explicit time override stable across an awaited factor lookup', async () => {
    const a = pair();
    mocks.factor.mockImplementation(async () => {
      vi.setSystemTime(at(121));
      return { data: 'factor-a', error: null };
    });
    const request = req(a.access.token);
    expect(
      await refreshAppSessionForRequest(request, {
        targetApp: 'learn',
        now: start,
      })
    ).toMatchObject({ ok: true, refreshed: false });
    expect(request.headers.get('authorization')).toBe(
      `Bearer ${a.access.token}`
    );
  });

  it.each(['invalid-signature', 'wrong-scope'])(
    'rejects %s access during a 503',
    async (kind) => {
      const a = pair();
      const access =
        kind === 'wrong-scope'
          ? a.refresh.token
          : createAppSessionTokenPair(
              { targetApp: 'learn', userId: 'actor-a' },
              { now: start, secret: 'different-synthetic-secret' }
            ).access.token;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unavailable()));
      const request = req(access, a.refresh.token);
      expect(
        await refreshAppSessionForRequest(request, { targetApp: 'learn' })
      ).toEqual({ ok: false, error: 'App session refresh unavailable' });
      expect(request.headers.get('authorization')).toBeNull();
      expect(mocks.account).not.toHaveBeenCalled();
    }
  );

  it('rejects a signed healthy replacement whose current factor is disallowed', async () => {
    vi.setSystemTime(at(50));
    const old = pair();
    const next = pair({ mfa: proof(seconds + 120, 'removed-factor') }, 120);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(replacement(next.access.token))
    );
    const request = req(old.access.token, old.refresh.token);
    const result = await refreshAppSessionForRequest(request, {
      targetApp: 'learn',
    });
    expect(result).toMatchObject({ ok: false, error: 'MFA required' });
    expect(request.headers.get('authorization')).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(2);
    expect(mocks.factor).toHaveBeenCalledTimes(2);
  });
});
