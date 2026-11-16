import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppSessionToken } from '../app-session';
import { isExpiringSetCookie } from './mounted-failure';
import {
  consumeVerifyTokenRequest,
  refreshAppSessionForRequest,
} from './index';

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  factors: vi.fn(),
  assurance: vi.fn(),
  appClaims: vi.fn(),
  signedRefresh: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: mocks.assurance,
}));
vi.mock('./verified-request-user', () => ({
  peekVerifiedTotpFactor: mocks.factors,
  bindRequestAppToken: vi.fn(),
}));
vi.mock('./supabase-app-claims', () => ({
  createAppSessionClaimsFromSupabaseClaims: mocks.appClaims,
}));
vi.mock('./signed-refresh', () => ({
  resolveSignedAppSessionForRequest: mocks.signedRefresh,
}));

const BASE = 'https://tuturuuu.com/mind';
const sharedCookie = 'sb-nzamlzqfdwaaxdefwraj-auth-token.0=provider-session';
const strictOptions = {
  sessionMode: 'supabase-only',
  targetApp: 'mind',
} as const;
const verifyOptions = {
  mountedSession: {
    mode: 'supabase-only',
    targetApp: 'mind',
    webAppUrl: 'https://tuturuuu.com',
  },
} as const;
const now = new Date('2026-11-16T01:00:00Z');
const exp = Math.floor(now.getTime() / 1000) + 3600;

function request(path: string, cookie = sharedCookie) {
  return new NextRequest(`${BASE}${path}`, {
    nextConfig: { basePath: '/mind' },
    headers: { cookie },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    'https://nzamlzqfdwaaxdefwraj.supabase.co'
  );
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-only-signing-secret');
  mocks.updateSession.mockResolvedValue({
    res: NextResponse.next(),
    claims: { sub: 'provider-user', exp, aal: 'aal1' },
  });
  mocks.assurance.mockResolvedValue(null);
  mocks.factors.mockReturnValue(false);
  mocks.appClaims.mockResolvedValue({
    sub: 'provider-user',
    target_app: 'mind',
    exp,
  });
  mocks.signedRefresh.mockResolvedValue({ ok: false, error: 'legacy called' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('opt-in mounted provider-only sessions', () => {
  it('does not use a valid legacy token when the shared cookie is absent', async () => {
    const legacy = createAppSessionToken(
      { targetApp: 'mind', userId: 'legacy-user' },
      { now }
    );
    const result = await refreshAppSessionForRequest(
      request('/boards', `tuturuuu_app_session=${legacy.token}`),
      { ...strictOptions, now }
    );
    expect(result).toEqual({ ok: false, error: 'Shared session unavailable' });
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(mocks.signedRefresh).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { sub: 'provider-user', exp: 1 },
    { sub: 'provider-user', exp, aal: 'tampered' },
  ])(
    'does not fall back after invalid or expired provider claims: %j',
    async (claims) => {
      const legacy = createAppSessionToken(
        { targetApp: 'mind', userId: 'legacy-user' },
        { now }
      );
      mocks.updateSession.mockResolvedValue({
        res: NextResponse.next(),
        claims,
      });
      const result = await refreshAppSessionForRequest(
        request(
          '/boards',
          `${sharedCookie}; tuturuuu_app_session=${legacy.token}`
        ),
        { ...strictOptions, now }
      );
      expect(result.ok).toBe(false);
      expect(mocks.signedRefresh).not.toHaveBeenCalled();
      expect(mocks.appClaims).not.toHaveBeenCalled();
    }
  );

  it('uses one provider refresh without issuing or clearing an app-session cookie', async () => {
    const res = NextResponse.next();
    res.headers.append(
      'set-cookie',
      'sb-nzamlzqfdwaaxdefwraj-auth-token.0=fresh; Domain=.tuturuuu.com; Path=/; Secure'
    );
    mocks.updateSession.mockResolvedValue({
      res,
      claims: { sub: 'provider-user', exp, aal: 'aal1' },
    });
    const req = request(
      '/boards',
      `${sharedCookie}; tuturuuu_app_session=ignored`
    );
    req.headers.set('authorization', 'Bearer ttr_app_ignored');
    const result = await refreshAppSessionForRequest(req, {
      ...strictOptions,
      now,
    });
    expect(result.ok).toBe(true);
    expect(mocks.updateSession).toHaveBeenCalledTimes(1);
    expect(mocks.signedRefresh).not.toHaveBeenCalled();
    expect(req.cookies.has('tuturuuu_app_session')).toBe(false);
    expect(req.headers.has('authorization')).toBe(false);
    if (result.ok) {
      expect(result.requestHeaders?.has('authorization')).toBe(false);
      expect(result.response.headers.getSetCookie()).toEqual(
        res.headers.getSetCookie()
      );
      expect(
        result.response.headers
          .getSetCookie()
          .some((cookie) => cookie.startsWith('tuturuuu_'))
      ).toBe(false);
    }
  });

  it.each(['aal1', 'aal2'])(
    'fails closed for enrolled MFA users until the verified helper is qualified: %s',
    async (aal) => {
      mocks.updateSession.mockResolvedValue({
        res: NextResponse.next(),
        claims: { sub: 'provider-user', exp, aal },
      });
      mocks.factors.mockReturnValue(true);
      const result = await refreshAppSessionForRequest(request('/boards'), {
        ...strictOptions,
        now,
      });
      expect(result).toMatchObject({ ok: false, error: 'MFA required' });
      expect(mocks.appClaims).not.toHaveBeenCalled();
      expect(mocks.signedRefresh).not.toHaveBeenCalled();
    }
  );

  it('preserves an unavailable or required account-assurance refusal', async () => {
    mocks.assurance.mockResolvedValueOnce(
      new NextResponse(null, { status: 503 })
    );
    const unavailable = await refreshAppSessionForRequest(request('/boards'), {
      ...strictOptions,
      now,
    });
    expect(unavailable).toMatchObject({
      ok: false,
      error: 'Account assurance unavailable',
    });
    mocks.assurance.mockResolvedValueOnce(
      new NextResponse(null, { status: 403 })
    );
    const required = await refreshAppSessionForRequest(request('/boards'), {
      ...strictOptions,
      now,
    });
    expect(required).toMatchObject({ ok: false, error: 'MFA required' });
    expect(mocks.appClaims).not.toHaveBeenCalled();
    expect(mocks.signedRefresh).not.toHaveBeenCalled();
  });

  it('preserves existing root-host modes', async () => {
    const root = new NextRequest('https://mind.tuturuuu.com/boards');
    await refreshAppSessionForRequest(root, {
      targetApp: 'mind',
      sessionMode: 'app-session',
    });
    await refreshAppSessionForRequest(root, {
      targetApp: 'mind',
      sessionMode: 'supabase-first',
    });
    expect(mocks.signedRefresh).toHaveBeenCalledTimes(2);
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('never derives a trusted mount from a client header', async () => {
    const root = new NextRequest('https://mind.tuturuuu.com/boards', {
      headers: { cookie: sharedCookie, 'x-tuturuuu-app-base': '/mind' },
    });
    const result = await refreshAppSessionForRequest(root, {
      ...strictOptions,
      now,
    });
    expect(result.ok).toBe(false);
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(mocks.signedRefresh).not.toHaveBeenCalled();
  });
});

describe('mounted verify-token requires a shared session before redirecting', () => {
  beforeEach(() => {
    mocks.updateSession.mockResolvedValue({
      res: NextResponse.next(),
      claims: {
        sub: 'provider-user',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aal: 'aal1',
      },
    });
  });

  it('sends a missing session to Web login and never exchanges the supplied handoff token', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await consumeVerifyTokenRequest(
      request(
        '/verify-token?token=never-exchange&nextUrl=%2Fmind%2Fboards',
        ''
      ),
      verifyOptions
    );
    const location = new URL(response!.headers.get('location')!);
    expect(`${location.origin}${location.pathname}`).toBe(
      'https://tuturuuu.com/login'
    );
    const callback = new URL(location.searchParams.get('returnUrl')!);
    expect(`${callback.origin}${callback.pathname}`).toBe(
      `${BASE}/verify-token`
    );
    expect(callback.searchParams.get('nextUrl')).toBe('/mind/boards');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.signedRefresh).not.toHaveBeenCalled();
  });

  it.each([
    '//evil.com',
    '/\\evil.com',
    '/%2F%2Fevil.com',
    'https:evil.com',
    'https://tuturuuu.com@evil.com',
    'HTTPS://EVIL.com',
    'javascript:',
    'data:',
    'https://calendar.tuturuuu.com/mind',
    '/mind/../admin',
    '/mind%2F..',
    '/mindful',
    '/mind/login',
    '/mind/verify-token',
    '/mind/api/auth/callback',
  ])(
    'rejects a session-bearing redirect outside its owned mount: %s',
    async (value) => {
      const response = await consumeVerifyTokenRequest(
        request(`/verify-token?nextUrl=${encodeURIComponent(value)}`),
        verifyOptions
      );
      expect(response!.headers.get('location')).toBe(BASE);
      expect(response!.headers.get('cache-control')).toBe('private, no-store');
      expect(mocks.updateSession).toHaveBeenCalledTimes(1);
      expect(mocks.signedRefresh).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['/mind/boards/?q=%20&x=%2f#section', `${BASE}/boards?q=%20&x=%2f#section`],
    ['https://tuturuuu.com/mind/boards?q=%20', `${BASE}/boards?q=%20`],
    ['/mind/', BASE],
  ])(
    'keeps an allowed prefix, query bytes and fragment: %s',
    async (value, expected) => {
      const response = await consumeVerifyTokenRequest(
        request(`/verify-token?nextUrl=${encodeURIComponent(value)}`),
        verifyOptions
      );
      expect(response!.headers.get('location')).toBe(expected);
      expect(mocks.updateSession).toHaveBeenCalledTimes(1);
    }
  );

  it('sends MFA-enrolled sessions to Web MFA without redeeming a token', async () => {
    mocks.factors.mockReturnValue(true);
    const response = await consumeVerifyTokenRequest(
      request('/verify-token?token=never-exchange'),
      verifyOptions
    );
    const location = new URL(response!.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('mfa')).toBe('required');
    expect(mocks.signedRefresh).not.toHaveBeenCalled();
  });
});

describe('mounted refusals never expire Web-owned provider cookies', () => {
  const fresh =
    'sb-nzamlzqfdwaaxdefwraj-auth-token.0=fresh; Domain=.tuturuuu.com; Path=/; Max-Age=3600';
  function refreshWithDeletions(claims: unknown) {
    const res = NextResponse.next();
    res.headers.append('set-cookie', fresh);
    res.headers.append(
      'set-cookie',
      'sb-nzamlzqfdwaaxdefwraj-auth-token.1=; Domain=.tuturuuu.com; Path=/; Max-Age=0'
    );
    res.headers.append(
      'set-cookie',
      'sb-nzamlzqfdwaaxdefwraj-auth-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );
    mocks.updateSession.mockResolvedValue({ res, claims });
  }
  const expires = (response: Response | undefined) =>
    (response?.headers.getSetCookie() ?? []).some((cookie) =>
      isExpiringSetCookie(cookie)
    );

  it.each([
    ['invalid claims', null, null],
    ['required MFA', { sub: 'provider-user', exp, aal: 'aal1' }, 403],
    ['unavailable assurance', { sub: 'provider-user', exp, aal: 'aal1' }, 503],
  ])('%s keeps only the refreshed cookie writes', async (_, claims, status) => {
    refreshWithDeletions(claims);
    if (status)
      mocks.assurance.mockResolvedValueOnce(new NextResponse(null, { status }));
    const result = await refreshAppSessionForRequest(request('/boards'), {
      ...strictOptions,
      now,
    });
    expect(result.ok).toBe(false);
    expect(expires(result.response)).toBe(false);
    expect(result.response?.headers.getSetCookie()).toEqual([fresh]);
  });

  it('sends a refused verify-token to login without expiring cookies', async () => {
    refreshWithDeletions(null);
    const response = await consumeVerifyTokenRequest(
      request('/verify-token?nextUrl=%2Fmind%2Fboards'),
      verifyOptions
    );
    expect(response!.status).toBe(307);
    expect(response!.headers.get('cache-control')).toBe('private, no-store');
    expect(expires(response!)).toBe(false);
  });

  it('answers unavailable assurance on verify-token instead of looping through login', async () => {
    refreshWithDeletions({ sub: 'provider-user', exp, aal: 'aal1' });
    mocks.assurance.mockResolvedValueOnce(
      new NextResponse(null, { status: 503 })
    );
    const response = await consumeVerifyTokenRequest(
      request('/verify-token?nextUrl=%2Fmind%2Fboards'),
      verifyOptions
    );
    expect(response!.status).toBe(503);
    expect(response!.headers.get('location')).toBeNull();
    expect(response!.headers.get('cache-control')).toBe('private, no-store');
    expect(expires(response!)).toBe(false);
    expect(mocks.signedRefresh).not.toHaveBeenCalled();
  });
});
