import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_SESSION_COOKIE_NAME, createAppSessionToken } from '../app-session';
import {
  MFA_MOBILE_APPROVAL_COOKIE_NAME,
  MFA_MOBILE_APPROVAL_KIND,
} from '../mfa-mobile-approval';
import {
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
          approval_metadata: { mobileMfaValidUntil: validUntil },
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
      claims: { aal: 'aal1', sub: 'user-1' },
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
