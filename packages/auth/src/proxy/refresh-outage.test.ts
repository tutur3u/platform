import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  createAppSessionTokenPair,
} from '../app-session';
import { createRefreshPOST } from '../cross-app/server';
import {
  appSessionFailureResponse,
  createCentralizedAuthProxy,
  refreshAppSessionForRequest,
} from './index';

const mocks = vi.hoisted(() => ({
  mfaAllowed: vi.fn(),
  updateSession: vi.fn(),
}));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  resolveRequiredMfaAppSessionAuthority: async () =>
    (await mocks.mfaAllowed())
      ? { status: 'allowed', required: false }
      : { status: 'denied' },
  isRequiredMfaAppSessionAllowed: mocks.mfaAllowed,
  isRequiredMfaProofAllowed: async () => true,
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

const issuedAt = new Date('2026-01-01T00:00:00Z');
const early = new Date('2026-01-01T00:00:50Z');
const expired = new Date('2026-01-01T00:01:01Z');
function request(path = '/dashboard', targetApp = 'learn') {
  const pair = createAppSessionTokenPair(
    { userId: 'synthetic-actor', targetApp },
    {
      now: issuedAt,
      policy: {
        internalAppAccessTtlSeconds: 60,
        internalAppRefreshEarlySeconds: 20,
        internalAppRefreshTtlSeconds: 3600,
      },
    }
  );
  return new NextRequest(`https://learn.example.test${path}`, {
    headers: {
      cookie: [
        `${APP_SESSION_COOKIE_NAME}=${pair.access.token}`,
        `${APP_SESSION_REFRESH_COOKIE_NAME}=${pair.refresh.token}`,
      ].join('; '),
    },
  });
}
function unavailable() {
  return Response.json(
    {
      code: 'APP_SESSION_REFRESH_UNAVAILABLE',
      error: 'App session refresh temporarily unavailable',
    },
    { status: 503 }
  );
}

beforeEach(() => {
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    'synthetic-outage-test-secret'
  );
  mocks.mfaAllowed.mockReset().mockResolvedValue(true);
  mocks.updateSession
    .mockReset()
    .mockResolvedValue({ claims: null, res: NextResponse.next() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('refresh outage authority and cookie boundaries', () => {
  it('preserves 503 through real satellite refresh and proxy handlers', async () => {
    const refresh = createRefreshPOST('learn', {
      verificationBaseUrl: 'https://central.example.test',
    });
    const fetchMock = vi.fn(
      async (
        input: string | URL | Request,
        init?: ConstructorParameters<typeof NextRequest>[1]
      ) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/v1/auth/cross-app-session/refresh')
          return unavailable();
        expect(url.pathname).toBe('/api/auth/refresh-app-session');
        return refresh(new NextRequest(url, init));
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await createCentralizedAuthProxy({
      webAppUrl: 'https://central.example.test',
      appSession: { targetApp: 'learn', now: expired },
    })(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'APP_SESSION_REFRESH_UNAVAILABLE',
      error: 'App session refresh temporarily unavailable',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retains independently valid access without rotating or clearing app cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(unavailable());
    vi.stubGlobal('fetch', fetchMock);
    const req = request();
    const originalCookie = req.headers.get('cookie');
    const result = await refreshAppSessionForRequest(req, {
      targetApp: 'learn',
      now: early,
    });
    expect(result).toMatchObject({
      ok: true,
      refreshed: false,
      claims: { sub: 'synthetic-actor' },
    });
    expect(result.response?.headers.get('set-cookie')).toBeNull();
    expect(req.headers.get('cookie')).toBe(originalCookie);
    expect(mocks.mfaAllowed).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not admit access that expires while refresh is in flight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(early);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.setSystemTime(expired);
        return unavailable();
      })
    );
    const req = request();
    const result = await refreshAppSessionForRequest(req, {
      targetApp: 'learn',
    });
    expect(result).toEqual({
      ok: false,
      error: 'App session refresh unavailable',
    });
    expect(req.headers.get('authorization')).toBeNull();
  });

  it('does not admit a replacement that is expired when its response arrives', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(expired);
    const replacement = createAppSessionTokenPair(
      { targetApp: 'learn', userId: 'synthetic-actor' },
      {
        now: expired,
        policy: { internalAppAccessTtlSeconds: 1 },
      }
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.setSystemTime(new Date(expired.getTime() + 2000));
        return new Response(null, {
          status: 200,
          headers: {
            'set-cookie': `${APP_SESSION_COOKIE_NAME}=${replacement.access.token}; Path=/; HttpOnly`,
          },
        });
      })
    );
    const req = request();
    expect(
      (await refreshAppSessionForRequest(req, { targetApp: 'learn' })).ok
    ).toBe(false);
    expect(req.headers.get('authorization')).toBeNull();
  });

  it('preserves configured shared-provider cookies alongside valid app access', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://synthetic-project.supabase.co'
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unavailable()));
    const original = request();
    const cookie = `${original.headers.get('cookie')}; sb-synthetic-project-auth-token.0=existing`;
    const req = new NextRequest('https://learn.tuturuuu.com/dashboard', {
      headers: { cookie },
    });
    const result = await refreshAppSessionForRequest(req, {
      targetApp: 'learn',
      now: early,
    });
    expect(result).toMatchObject({ ok: true, refreshed: false });
    expect(result.response?.headers.get('set-cookie')).toBeNull();
    expect(req.headers.get('cookie')).toBe(cookie);
  });

  it.each(['/dashboard', '/api/private'])(
    'returns no-store 503 for expired access on %s',
    async (path) => {
      const fetchMock = vi.fn().mockResolvedValue(unavailable());
      vi.stubGlobal('fetch', fetchMock);
      const req = request(path);
      const originalCookie = req.headers.get('cookie');
      const proxy = createCentralizedAuthProxy({
        webAppUrl: 'https://central.example.test',
        appSession: { targetApp: 'learn', now: expired },
      });
      const response = await proxy(req);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        code: 'APP_SESSION_REFRESH_UNAVAILABLE',
        error: 'App session refresh temporarily unavailable',
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBeNull();
      expect(req.headers.get('cookie')).toBe(originalCookie);
      expect(req.headers.get('authorization')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('does not copy upstream cookies or infer identity from a failed refresh body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { userId: 'untrusted', valid: true },
          {
            status: 503,
            headers: { 'set-cookie': 'tuturuuu_app_session=untrusted' },
          }
        )
      )
    );
    const req = request();
    const result = await refreshAppSessionForRequest(req, {
      targetApp: 'learn',
      now: expired,
    });
    expect(result).toEqual({
      ok: false,
      error: 'App session refresh unavailable',
    });
    expect(req.headers.get('authorization')).toBeNull();
    const response = appSessionFailureResponse(
      req,
      result.ok ? '' : result.error
    );
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('never substitutes a wrong-target access token for unavailable refresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unavailable()));
    expect(
      await refreshAppSessionForRequest(request('/dashboard', 'chat'), {
        targetApp: 'learn',
        now: early,
      })
    ).toEqual({ ok: false, error: 'App session refresh unavailable' });
  });

  it.each([401, 400, 500])(
    'does not classify central %s as replay-store unavailability',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(null, { status }))
      );
      expect(
        await refreshAppSessionForRequest(request(), {
          targetApp: 'learn',
          now: expired,
        })
      ).toEqual({
        ok: false,
        error: 'Invalid app session refresh credentials',
      });
    }
  );

  it('does not relabel transport rejection as replay-store unavailability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('synthetic transport failure'))
    );
    expect(
      await refreshAppSessionForRequest(request(), {
        targetApp: 'learn',
        now: expired,
      })
    ).toEqual({ ok: false, error: 'Invalid app session refresh credentials' });
  });

  it('retains MFA rejection instead of using valid access as an escape', async () => {
    mocks.mfaAllowed.mockResolvedValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await refreshAppSessionForRequest(request(), {
        targetApp: 'learn',
        now: early,
      })
    ).toEqual({ ok: false, error: 'MFA required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves an explicit central MFA rejection without falling back to existing access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    );
    const req = request();
    const result = await refreshAppSessionForRequest(req, {
      targetApp: 'learn',
      now: early,
    });
    expect(result).toEqual({ ok: false, error: 'MFA required' });
    expect(
      appSessionFailureResponse(req, result.ok ? '' : result.error).status
    ).toBe(403);
  });
  it('keeps healthy rotation bound to the verified replacement cookie', async () => {
    const pair = createAppSessionTokenPair(
      { targetApp: 'learn', userId: 'synthetic-actor' },
      {
        now: expired,
      }
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {
            'set-cookie': `${APP_SESSION_COOKIE_NAME}=${pair.access.token}; Path=/; HttpOnly`,
          },
        })
      )
    );
    const req = request();
    const result = await refreshAppSessionForRequest(req, {
      targetApp: 'learn',
      now: expired,
    });
    expect(result).toMatchObject({
      ok: true,
      refreshed: true,
      claims: { sub: 'synthetic-actor' },
    });
    expect(result.response?.headers.get('set-cookie')).toContain(
      pair.access.token
    );
    expect(req.headers.get('authorization')).toBe(
      `Bearer ${pair.access.token}`
    );
  });

  it('does not admit expired access when a success body supplies no verified replacement', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ valid: true, userId: 'untrusted' }))
    );
    const req = request();
    const result = await refreshAppSessionForRequest(req, {
      targetApp: 'learn',
      now: expired,
    });
    expect(result.ok).toBe(false);
    expect(req.headers.get('authorization')).toBeNull();
  });
});
