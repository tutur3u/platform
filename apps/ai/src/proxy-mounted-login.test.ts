import { getMountedAppVerifyTokenMatch } from '@tuturuuu/utils/internal-app-mounts';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

/**
 * The `tuturuuu.com/ai` sign-in round trip through the real mounted-session
 * code. Only the provider refresh, assurance and claim-minting boundaries are
 * fixtures.
 */
const mocks = vi.hoisted(() => ({
  appClaims: vi.fn(),
  assurance: vi.fn(),
  factors: vi.fn(),
  guard: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: mocks.assurance,
}));
vi.mock('../../../packages/auth/src/proxy/verified-request-user', () => ({
  bindRequestAppToken: vi.fn(),
  peekVerifiedTotpFactor: mocks.factors,
}));
vi.mock('../../../packages/auth/src/proxy/supabase-app-claims', () => ({
  createAppSessionClaimsFromSupabaseClaims: mocks.appClaims,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guard,
  hasAuthenticatedBearerToken: () => false,
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));
vi.mock('next-intl/navigation', () => ({ createNavigation: () => ({}) }));

const sharedCookie = 'sb-nzamlzqfdwaaxdefwraj-auth-token.0=provider-session';

function mounted(path: string, { cookie = '', method = 'GET' } = {}) {
  return new NextRequest(`https://tuturuuu.com/ai${path}`, {
    method,
    nextConfig: { basePath: '/ai' },
    ...(cookie && { headers: { cookie } }),
  });
}

const location = (response: Response) => response.headers.get('location');

function providerSession(expiresIn: number) {
  mocks.updateSession.mockImplementation(async () => ({
    res: NextResponse.next(),
    claims: {
      aal: 'aal1',
      exp: Math.floor(Date.now() / 1000) + expiresIn,
      sub: 'provider-user',
    },
  }));
}

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  // The shared cookie is recognised by the configured project's storage key.
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    'https://nzamlzqfdwaaxdefwraj.supabase.co'
  );
  providerSession(3600);
  mocks.assurance.mockResolvedValue(null);
  mocks.factors.mockReturnValue(false);
  mocks.guard.mockResolvedValue(null);
  mocks.appClaims.mockImplementation(async () => ({
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: 'provider-user',
    target_app: 'ai',
  }));
});

describe('signed-out visits to tuturuuu.com/ai', () => {
  it.each([
    ['', '/products/ai', 'GET'],
    ['/', '/products/ai', 'GET'],
    ['/', '/products/ai', 'HEAD'],
    ['/en', '/products/ai', 'GET'],
    ['/en/', '/products/ai', 'GET'],
    ['/vi', '/vi/products/ai', 'GET'],
    ['/vi/', '/vi/products/ai', 'HEAD'],
  ])(
    'keeps the AI product page for the root %j (%s)',
    async (path, page, method) => {
      const response = await proxy(
        mounted(`${path}?utm=a&utm=b%2Fc`, { method })
      );

      expect(response.status).toBe(307);
      expect(location(response)).toBe(
        `https://tuturuuu.com${page}?utm=a&utm=b%2Fc`
      );
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(mocks.updateSession).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['//', 'GET'],
    ['//', 'HEAD'],
    ['/personal', 'GET'],
    ['/vi/personal/playground', 'GET'],
    ['/envoy', 'GET'],
    ['/', 'POST'],
  ])('asks for a sign-in on %s (%s)', async (path, method) => {
    const response = await proxy(mounted(path, { method }));
    const login = new URL(location(response) ?? '');

    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    expect(new URL(login.searchParams.get('returnUrl') ?? '').pathname).toBe(
      '/ai/verify-token'
    );
  });
});

describe('the tuturuuu.com/ai login round trip', () => {
  it('returns through the apex mount once Web lists ai', async () => {
    const response = await proxy(mounted('/personal/playground?run=1&run=2'));
    const login = new URL(location(response) ?? '');
    const returnUrl = login.searchParams.get('returnUrl') ?? '';

    expect(getMountedAppVerifyTokenMatch(returnUrl, new Set(['ai']))).toEqual(
      expect.objectContaining({
        basePath: '/ai',
        name: 'ai',
        nextUrl: '/personal/playground?run=1&run=2',
        origin: 'https://tuturuuu.com',
      })
    );
    // While `/ai` is in PENDING_WEB_MOUNTS, Web does not know the callback.
    expect(getMountedAppVerifyTokenMatch(returnUrl, new Set())).toBeNull();
  });

  it('lands on the requested page from the shared session', async () => {
    const response = await proxy(
      mounted(
        '/verify-token?nextUrl=%2Fpersonal%2Fplayground%3Frun%3D1%26run%3D2',
        { cookie: sharedCookie }
      )
    );

    expect(response.status).toBe(307);
    expect(location(response)).toBe(
      'https://tuturuuu.com/ai/personal/playground?run=1&run=2'
    );
  });

  it.each(['https://evil.example/x', '//evil.example', '/../products'])(
    'never leaves the mount for nextUrl %s',
    async (nextUrl) => {
      const response = await proxy(
        mounted(`/verify-token?nextUrl=${encodeURIComponent(nextUrl)}`, {
          cookie: sharedCookie,
        })
      );
      const target = new URL(location(response) ?? '');

      expect(target.origin).toBe('https://tuturuuu.com');
      expect(
        target.pathname === '/ai' || target.pathname.startsWith('/ai/')
      ).toBe(true);
    }
  );

  it('opens the app at the root for a signed-in visitor', async () => {
    const response = await proxy(mounted('/', { cookie: sharedCookie }));

    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
    expect(mocks.updateSession).toHaveBeenCalledOnce();
  });

  it('sends an expired session at the root to Web, not to marketing', async () => {
    providerSession(-60);

    const response = await proxy(mounted('/', { cookie: sharedCookie }));

    expect(new URL(location(response) ?? '').pathname).toBe('/login');
  });

  it('serves the key-authenticated public API without a human session', async () => {
    const response = await proxy(mounted('/v1/models'));

    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
    expect(mocks.guard).toHaveBeenCalledOnce();
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });
});
