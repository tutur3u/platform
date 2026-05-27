import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  createAppSessionToken,
  createAppSessionTokenPair,
} from '../app-session';
import {
  MFA_MOBILE_APPROVAL_COOKIE_NAME,
  MFA_MOBILE_APPROVAL_KIND,
} from '../mfa-mobile-approval';
import {
  consumeVerifyTokenRequest,
  createCentralizedAuthProxy,
  normalizeAuthRedirectPath,
  resolveCanonicalRequestOrigin,
} from './index';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: (...args: Parameters<typeof mocks.updateSession>) =>
    mocks.updateSession(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

describe('auth proxy redirect helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.updateSession.mockResolvedValue({
      claims: null,
      res: NextResponse.next(),
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { totp: [] } }),
        },
      },
    });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(),
    });
  });

  it('resolves the canonical public origin from forwarded headers', () => {
    const request = new NextRequest('http://0.0.0.0:7803/dashboard', {
      headers: {
        'x-forwarded-host': 'tuturuuu.com',
        'x-forwarded-proto': 'https',
      },
    });

    expect(resolveCanonicalRequestOrigin(request, 'https://tuturuuu.com')).toBe(
      'https://tuturuuu.com'
    );
  });

  it('flattens nested login and verify-token redirect chains', () => {
    const nestedTarget = encodeURIComponent(
      '/verify-token?nextUrl=%2Fworkspace%2Fdemo%3Ftab%3Dmail'
    );

    expect(
      normalizeAuthRedirectPath(
        `/login?returnUrl=${nestedTarget}`,
        'https://tuturuuu.com'
      )
    ).toBe('/workspace/demo?tab=mail');
  });

  describe('consumeVerifyTokenRequest', () => {
    it('redirects missing-token verifier requests to a safe nextUrl without fetching', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const request = new NextRequest(
        'https://calendar.tuturuuu.com/verify-token?nextUrl=%2Fpersonal%3Fview%3Dweek'
      );

      const response = await consumeVerifyTokenRequest(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get('location')).toBe(
        'https://calendar.tuturuuu.com/personal?view=week'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('falls back for unsafe nextUrl values before redirecting', async () => {
      const request = new NextRequest(
        'https://calendar.tuturuuu.com/verify-token?nextUrl=https%3A%2F%2Fevil.test'
      );

      const response = await consumeVerifyTokenRequest(request, {
        fallbackPath: '/fallback',
      });

      expect(response?.headers.get('location')).toBe(
        'https://calendar.tuturuuu.com/fallback'
      );
    });

    it('posts the token to the local verifier and carries verifier cookies onto the redirect', async () => {
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append(
        'set-cookie',
        'tuturuuu_app_session=ttr_app_local; Path=/; HttpOnly'
      );
      headers.append(
        'set-cookie',
        'tuturuuu_web_app_session=ttr_app_web; Path=/; HttpOnly'
      );
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            appSessionCreated: true,
            userId: 'user-1',
            valid: true,
          }),
          { headers, status: 200 }
        )
      );
      vi.stubGlobal('fetch', fetchMock);
      const request = new NextRequest(
        'https://calendar.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fpersonal'
      );

      const response = await consumeVerifyTokenRequest(request);

      expect(response?.headers.get('location')).toBe(
        'https://calendar.tuturuuu.com/personal'
      );
      expect(fetchMock).toHaveBeenCalledWith(
        new URL('/api/auth/verify-app-token', 'https://calendar.tuturuuu.com'),
        expect.objectContaining({
          body: JSON.stringify({ token: 'copy-token' }),
          method: 'POST',
        })
      );
      const setCookie = response?.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('tuturuuu_app_session=ttr_app_local');
      expect(setCookie).toContain('tuturuuu_web_app_session=ttr_app_web');
    });

    it('clears stale Supabase cookies and redirects home when verification fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ error: 'Invalid token' }, { status: 401 })
          )
      );
      const request = new NextRequest(
        'https://calendar.tuturuuu.com/verify-token?token=bad-token&nextUrl=%2Fpersonal',
        {
          headers: {
            cookie: 'sb-project-auth-token=stale',
          },
        }
      );

      const response = await consumeVerifyTokenRequest(request);

      expect(response?.headers.get('location')).toBe(
        'https://calendar.tuturuuu.com/'
      );
      expect(response?.headers.get('set-cookie')).toContain(
        'sb-project-auth-token=;'
      );
    });

    it('returns null for non verifier paths', async () => {
      const response = await consumeVerifyTokenRequest(
        new NextRequest('https://calendar.tuturuuu.com/personal')
      );

      expect(response).toBeNull();
    });
  });

  it('redirects unauthenticated users through the public origin instead of the internal bind host', async () => {
    const authProxy = createCentralizedAuthProxy({
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('http://0.0.0.0:7803/mail', {
      headers: {
        host: '0.0.0.0:7803',
        'x-forwarded-host': 'tuturuuu.com',
        'x-forwarded-proto': 'https',
      },
    });

    const response = await authProxy(request);
    const location = response.headers.get('location');

    expect(location).toBeTruthy();
    expect(location).toContain('https://tuturuuu.com/login?returnUrl=');
    expect(location).toContain(
      encodeURIComponent('https://tuturuuu.com/verify-token?nextUrl=%2Fmail')
    );
    expect(location).not.toContain('0.0.0.0:7803');
  });

  it('lets aal1 sessions through when a consumed mobile MFA approval cookie is valid', async () => {
    const validUntil = new Date(Date.now() + 60_000).toISOString();
    const builder = {
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          approval_metadata: {
            approverSessionId: 'session-1',
            mobileMfaValidUntil: validUntil,
          },
          approver_user_id: 'user-1',
          request_metadata: { kind: MFA_MOBILE_APPROVAL_KIND },
          status: 'consumed',
        },
        error: null,
      }),
      select: vi.fn(() => builder),
    };
    const adminClient = {
      from: vi.fn(() => builder),
    };

    mocks.updateSession.mockResolvedValue({
      claims: { aal: 'aal1', session_id: 'session-1', sub: 'user-1' },
      res: NextResponse.next(),
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        mfa: {
          listFactors: vi.fn().mockResolvedValue({
            data: { totp: [{ status: 'verified' }] },
          }),
        },
      },
    });
    mocks.createAdminClient.mockResolvedValue(adminClient);

    const authProxy = createCentralizedAuthProxy({
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://tuturuuu.com/mail', {
      headers: {
        cookie: `${MFA_MOBILE_APPROVAL_COOKIE_NAME}=challenge-1.secret-1`,
      },
    });

    const response = await authProxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(adminClient.from).toHaveBeenCalledWith('qr_login_challenges');
  });

  it('redirects aal1 sessions when a mobile MFA approval cookie belongs to a different login session', async () => {
    const validUntil = new Date(Date.now() + 60_000).toISOString();
    const builder = {
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          approval_metadata: {
            approverSessionId: 'session-1',
            mobileMfaValidUntil: validUntil,
          },
          approver_user_id: 'user-1',
          request_metadata: { kind: MFA_MOBILE_APPROVAL_KIND },
          status: 'consumed',
        },
        error: null,
      }),
      select: vi.fn(() => builder),
    };

    mocks.updateSession.mockResolvedValue({
      claims: { aal: 'aal1', session_id: 'session-2', sub: 'user-1' },
      res: NextResponse.next(),
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        mfa: {
          listFactors: vi.fn().mockResolvedValue({
            data: { totp: [{ status: 'verified' }] },
          }),
        },
      },
    });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => builder),
    });

    const authProxy = createCentralizedAuthProxy({
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://tuturuuu.com/mail', {
      headers: {
        cookie: `${MFA_MOBILE_APPROVAL_COOKIE_NAME}=challenge-1.secret-1`,
      },
    });

    const response = await authProxy(request);
    const location = response.headers.get('location') ?? '';
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(location).toContain('https://tuturuuu.com/login?');
    expect(location).toContain('mfa=required');
    expect(setCookie).toContain(`${MFA_MOBILE_APPROVAL_COOKIE_NAME}=;`);
    expect(setCookie).toContain('Max-Age=0');
  });

  it('lets registered apps through with a valid app-session cookie without refreshing Supabase auth', async () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const authProxy = createCentralizedAuthProxy({
      appSession: { targetApp: 'learn' },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/dashboard', {
      headers: {
        cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const response = await authProxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('refreshes registered app sessions when the access cookie is near expiry', async () => {
    const oldSession = createAppSessionTokenPair(
      {
        targetApp: 'learn',
        userId: 'user-1',
      },
      {
        now: new Date('2026-01-01T00:00:00.000Z'),
        policy: {
          internalAppAccessTtlSeconds: 600,
          internalAppRefreshEarlySeconds: 120,
          internalAppRefreshTtlSeconds: 86_400,
        },
      }
    );
    const newSession = createAppSessionTokenPair(
      {
        targetApp: 'learn',
        userId: 'user-1',
      },
      {
        now: new Date('2026-01-01T00:09:00.000Z'),
      }
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ appSessionCreated: true }), {
        headers: {
          'set-cookie': `${APP_SESSION_COOKIE_NAME}=${newSession.access.token}; Path=/; HttpOnly`,
        },
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const authProxy = createCentralizedAuthProxy({
      appSession: {
        now: new Date('2026-01-01T00:08:30.000Z'),
        targetApp: 'learn',
      },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/dashboard', {
      headers: {
        cookie: [
          `${APP_SESSION_COOKIE_NAME}=${oldSession.access.token}`,
          `${APP_SESSION_REFRESH_COOKIE_NAME}=${oldSession.refresh.token}`,
        ].join('; '),
      },
    });

    const response = await authProxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toContain(
      `${APP_SESSION_COOKIE_NAME}=ttr_app_`
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/refresh-app-session', 'https://learn.tuturuuu.com'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('lets expired registered app API requests proceed after refresh', async () => {
    const oldSession = createAppSessionTokenPair(
      {
        targetApp: 'learn',
        userId: 'user-1',
      },
      {
        now: new Date('2026-01-01T00:00:00.000Z'),
        policy: {
          internalAppAccessTtlSeconds: 1,
          internalAppRefreshEarlySeconds: 120,
          internalAppRefreshTtlSeconds: 86_400,
        },
      }
    );
    const newSession = createAppSessionTokenPair(
      {
        targetApp: 'learn',
        userId: 'user-1',
      },
      {
        now: new Date('2026-01-01T00:00:02.000Z'),
      }
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ appSessionCreated: true }), {
          headers: {
            'set-cookie': `${APP_SESSION_COOKIE_NAME}=${newSession.access.token}; Path=/; HttpOnly`,
          },
          status: 200,
        })
      )
    );

    const authProxy = createCentralizedAuthProxy({
      appSession: {
        now: new Date('2026-01-01T00:00:02.000Z'),
        targetApp: 'learn',
      },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/api/data', {
      headers: {
        cookie: [
          `${APP_SESSION_COOKIE_NAME}=${oldSession.access.token}`,
          `${APP_SESSION_REFRESH_COOKIE_NAME}=${oldSession.refresh.token}`,
        ].join('; '),
      },
    });

    const response = await authProxy(request);

    expect(response.status).not.toBe(401);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toContain(
      `${APP_SESSION_COOKIE_NAME}=ttr_app_`
    );
  });

  it('returns 401 for registered app API requests with invalid refresh credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: 'nope' }, { status: 401 }))
    );
    const authProxy = createCentralizedAuthProxy({
      appSession: {
        now: new Date('2026-01-01T00:00:02.000Z'),
        targetApp: 'learn',
      },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/api/data', {
      headers: {
        cookie: `${APP_SESSION_REFRESH_COOKIE_NAME}=ttr_app_invalid`,
      },
    });

    const response = await authProxy(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('expires stale Supabase auth cookies on registered app responses', async () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const authProxy = createCentralizedAuthProxy({
      appSession: { targetApp: 'learn' },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/dashboard', {
      headers: {
        cookie: [
          `${APP_SESSION_COOKIE_NAME}=${token}`,
          'sb-test-auth-token=stale',
          'sb-test-auth-token.0=stale-chunk',
        ].join('; '),
      },
    });

    const response = await authProxy(request);
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.headers.get('location')).toBeNull();
    expect(setCookie).toContain('sb-test-auth-token=;');
    expect(setCookie).toContain('sb-test-auth-token.0=;');
    expect(setCookie).toContain('Max-Age=0');
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('redirects registered app requests without an app-session cookie through web login', async () => {
    const authProxy = createCentralizedAuthProxy({
      appSession: { targetApp: 'learn' },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/dashboard');

    const response = await authProxy(request);
    const location = response.headers.get('location');

    expect(location).toContain('https://tuturuuu.com/login?returnUrl=');
    expect(location).toContain(
      encodeURIComponent(
        'https://learn.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'
      )
    );
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('keeps Portless app requests under the Tuturuuu localhost namespace', async () => {
    const authProxy = createCentralizedAuthProxy({
      appSession: { targetApp: 'tasks' },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.localhost',
    });
    const request = new NextRequest(
      'https://tasks.tuturuuu.localhost/personal/tasks'
    );

    const response = await authProxy(request);
    const location = response.headers.get('location') ?? '';

    expect(location).toContain('https://tuturuuu.localhost/login?returnUrl=');
    expect(location).toContain(
      encodeURIComponent(
        'https://tasks.tuturuuu.localhost/verify-token?nextUrl=%2Fpersonal%2Ftasks'
      )
    );
    expect(location).not.toContain('http://localhost:7803');
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('builds registered app return URLs from forwarded public app hosts', async () => {
    const authProxy = createCentralizedAuthProxy({
      appSession: { targetApp: 'learn' },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('http://0.0.0.0:7812/dashboard', {
      headers: {
        host: '0.0.0.0:7812',
        'x-forwarded-host': 'learn.tuturuuu.com',
        'x-forwarded-proto': 'https',
      },
    });

    const response = await authProxy(request);
    const location = response.headers.get('location') ?? '';

    expect(location).toContain('https://tuturuuu.com/login?returnUrl=');
    expect(location).toContain(
      encodeURIComponent(
        'https://learn.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'
      )
    );
    expect(location).not.toContain('0.0.0.0:7812');
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('redirects registered app requests with a different target app session', async () => {
    const { token } = createAppSessionToken({
      targetApp: 'teach',
      userId: 'user-1',
    });
    const authProxy = createCentralizedAuthProxy({
      appSession: { targetApp: 'learn' },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/dashboard', {
      headers: {
        cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const response = await authProxy(request);

    expect(response.headers.get('location')).toContain(
      'https://tuturuuu.com/login?returnUrl='
    );
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('redirects registered app requests with an expired app-session cookie', async () => {
    const { token } = createAppSessionToken(
      {
        expiresInSeconds: 1,
        targetApp: 'learn',
        userId: 'user-1',
      },
      { now: new Date('2026-01-01T00:00:00.000Z') }
    );
    const authProxy = createCentralizedAuthProxy({
      appSession: {
        now: new Date('2026-01-01T00:00:02.000Z'),
        targetApp: 'learn',
      },
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/dashboard', {
      headers: {
        cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const response = await authProxy(request);

    expect(response.headers.get('location')).toContain(
      'https://tuturuuu.com/login?returnUrl='
    );
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });
});
