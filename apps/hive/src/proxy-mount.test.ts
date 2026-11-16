import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: vi.fn(async () => null),
  refreshAppSessionForRequest: vi.fn(async () => ({
    ok: false,
    error: 'App signed out',
  })),
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

// D360 R3: on tuturuuu.com/hive the bridge builds the request with Next
// basePath '/hive'; Hive's own locale cookie must stay under /hive.
describe('Hive proxy on the tuturuuu.com/hive mount', () => {
  it('writes NEXT_LOCALE with Path=/hive, never Path=/', async () => {
    const response = await proxy(
      new NextRequest('https://tuturuuu.com/hive/vi/tasks', {
        nextConfig: { basePath: '/hive' },
      })
    );
    const locale = response.headers
      .getSetCookie()
      .filter((value) => value.startsWith('NEXT_LOCALE='));
    expect(locale.length).toBeGreaterThan(0);
    for (const value of locale) {
      expect(value).toMatch(/;\s*Path=\/hive(?:;|$)/iu);
      expect(value).not.toMatch(/;\s*Path=\/(?:;|$)/iu);
    }
  });

  it.each([
    ['/hive/vi/tasks', 'https://tuturuuu.com/hive/tasks'],
    ['/hive/en/verify-token?x=1', 'https://tuturuuu.com/hive/verify-token?x=1'],
    ['/hive/vi', 'https://tuturuuu.com/hive'],
  ])(
    'keeps the locale redirect for %s inside /hive',
    async (path, location) => {
      const response = await proxy(
        new NextRequest(`https://tuturuuu.com${path}`, {
          nextConfig: { basePath: '/hive' },
        })
      );
      expect(response.headers.get('location')).toBe(location);
    }
  );

  it('sends a signed-out mounted page to /hive/login, not Web login', async () => {
    const response = await proxy(
      new NextRequest('https://tuturuuu.com/hive/tasks', {
        nextConfig: { basePath: '/hive' },
      })
    );
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/hive/login');
    expect(location.searchParams.get('next')).toBe('/tasks');
  });

  it('keeps Path=/ on hive.tuturuuu.com', async () => {
    const response = await proxy(
      new NextRequest('https://hive.tuturuuu.com/vi/tasks')
    );
    const locale = response.headers
      .getSetCookie()
      .filter((value) => value.startsWith('NEXT_LOCALE='));
    expect(locale.length).toBeGreaterThan(0);
    for (const value of locale) expect(value).toMatch(/;\s*Path=\/(?:;|$)/iu);
    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.com/tasks'
    );
  });
});
