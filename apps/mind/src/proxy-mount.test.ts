import {
  consumeVerifyTokenRequest,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import { isExpiringSetCookie } from '@tuturuuu/auth/proxy/mounted-failure';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
}));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));
vi.mock('next-intl/routing', () => ({
  defineRouting: (config: unknown) => config,
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: 'a',
    redirect: () => undefined,
    usePathname: () => '/',
    useRouter: () => ({}),
  }),
}));

const CURRENT = 'sb-nzamlzqfdwaaxdefwraj-auth-token';
// A provider cookie of another project: root-host refusals clear it.
const COOKIE = `${CURRENT}.0=current; sb-otherprojectref-auth-token=stale`;
const FRESH = `${CURRENT}.0=fresh; Domain=.tuturuuu.com; Path=/; Max-Age=3600`;
const DELETION = `${CURRENT}.1=; Domain=.tuturuuu.com; Path=/; Max-Age=0`;

function mounted(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://tuturuuu.com/mind${path}`, {
    nextConfig: { basePath: '/mind' },
    headers: { cookie: COOKIE, ...headers },
  });
}

function bearer(path: string, authorization: string) {
  return new NextRequest(`https://tuturuuu.com/mind${path}`, {
    nextConfig: { basePath: '/mind' },
    headers: { authorization },
  });
}

function refreshed(...cookies: string[]) {
  const response = NextResponse.next();
  for (const cookie of cookies) response.headers.append('set-cookie', cookie);
  return response;
}

function refuse(error: string) {
  vi.mocked(refreshAppSessionForRequest).mockResolvedValue({
    ok: false,
    error,
    response: refreshed(FRESH, DELETION),
  });
}

function expectPrivateWithoutExpiry(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(
    response.headers
      .getSetCookie()
      .filter((cookie) => isExpiringSetCookie(cookie))
  ).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    'https://nzamlzqfdwaaxdefwraj.supabase.co'
  );
  vi.mocked(consumeVerifyTokenRequest).mockResolvedValue(null);
  vi.mocked(guardApiProxyRequest).mockResolvedValue(null);
  vi.mocked(refreshAppSessionForRequest).mockResolvedValue({
    ok: true,
    claims: { sub: 'fixture-user' } as never,
    refreshed: false,
    response: refreshed(FRESH),
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('mounted Mind responses are never cached', () => {
  it('sends a signed-out page to the mounted login with a 307 private, no-store', async () => {
    refuse('Shared session unavailable');
    const response = await proxy(mounted('/boards'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
    expectPrivateWithoutExpiry(response);
  });

  it('redirects a locale-prefixed path with a 307 private, no-store', async () => {
    const response = await proxy(mounted('/vi/boards'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/boards');
    expect(response.headers.getSetCookie().join('\n')).toContain(
      'mind_locale=vi'
    );
    expectPrivateWithoutExpiry(response);
  });

  it('marks a personalised page private, no-store', async () => {
    const response = await proxy(
      mounted('/boards', {
        cookie: `${COOKIE}; tuturuuu_web_app_session=ttr_app_web`,
      })
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.getSetCookie()).toContain(FRESH);
    expectPrivateWithoutExpiry(response);
  });

  it('marks the public mounted login private, no-store and keeps only cookie writes', async () => {
    refuse('Shared session unavailable');
    const response = await proxy(mounted('/login'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.getSetCookie()).toEqual([FRESH]);
    expectPrivateWithoutExpiry(response);
  });

  it('keeps a verify-token response private, no-store', async () => {
    vi.mocked(consumeVerifyTokenRequest).mockResolvedValue(
      NextResponse.redirect('https://tuturuuu.com/mind/boards')
    );
    const response = await proxy(mounted('/verify-token'));
    expect(response.status).toBe(307);
    expectPrivateWithoutExpiry(response);
  });

  it('leaves root-host caching to the existing headers', async () => {
    const response = await proxy(
      new NextRequest('https://mind.tuturuuu.com/login')
    );
    expect(response.headers.get('cache-control')).toBeNull();
  });
});

describe('mounted Mind refusals never clear Web-owned cookies', () => {
  it.each([
    ['/api/boards', 'Shared session unavailable', 401],
    ['/api/boards', 'App signed out', 401],
    ['/api/boards', 'MFA required', 403],
    ['/api/boards', 'Account assurance unavailable', 503],
    ['/login', 'App signed out', 401],
    ['/boards', 'MFA required', 403],
    ['/boards', 'Account assurance unavailable', 503],
    ['/boards', 'App session refresh unavailable', 503],
  ])('%s refused with %s', async (path, error, status) => {
    refuse(error);
    const response = await proxy(mounted(path));
    expect(response.status).toBe(status);
    expectPrivateWithoutExpiry(response);
  });

  it('keeps cookies on a mounted API guard refusal', async () => {
    vi.mocked(guardApiProxyRequest).mockResolvedValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    );
    const response = await proxy(mounted('/api/boards'));
    expect(response.status).toBe(429);
    expect(response.headers.getSetCookie()).toEqual([FRESH]);
    expectPrivateWithoutExpiry(response);
  });

  it('answers an unauthenticated mounted API request without any Set-Cookie', async () => {
    refuse('Shared session unavailable');
    const response = await proxy(mounted('/api/boards'));
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe('mounted Mind Authorization boundary', () => {
  it.each([
    ['/api/boards', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln'],
    ['/api/boards', 'Basic Zml4dHVyZTpzZWNyZXQ='],
    ['/boards', 'Bearer ttr_app_forged.payload.signature'],
    ['/boards', 'Bearer'],
  ])('refuses %s with %s before any session work', async (path, value) => {
    const response = await proxy(bearer(path, value));
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
    expectPrivateWithoutExpiry(response);
    expect(refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(guardApiProxyRequest).not.toHaveBeenCalled();
  });
});
