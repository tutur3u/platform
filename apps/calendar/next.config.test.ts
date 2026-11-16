// @vitest-environment node
import { buildCustomRoute } from 'next/dist/lib/build-custom-route';
import loadCustomRoutes from 'next/dist/lib/load-custom-routes';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

type LoadedRoute = Awaited<
  ReturnType<typeof loadCustomRoutes>
>['redirects'][number];

const NO_STORE = [{ key: 'Cache-Control', value: 'private, no-store' }];

// Next's own loader, so sources carry the same basePath handling, validation
// and emitted regex as `.next/routes-manifest.json`.
async function loadRoutes() {
  return loadCustomRoutes(nextConfig as Parameters<typeof loadCustomRoutes>[0]);
}

function manifestRegex(type: 'redirect' | 'rewrite', route: LoadedRoute) {
  const built = buildCustomRoute(type, route as never, ['/calendar/_next']);
  return new RegExp(built.regex, 'i');
}

/** Resolves a request URL the way `next start` applies the first match. */
async function resolveRedirect(url: string) {
  const { redirects } = await loadRoutes();
  const parsed = new URL(url, 'https://calendar.tuturuuu.com');
  for (const route of redirects) {
    if (!manifestRegex('redirect', route).test(parsed.pathname)) continue;
    const params = getPathMatch(route.source, {
      strict: true,
      removeUnnamedParams: true,
    })(parsed.pathname);
    if (!params) throw new Error(`regex and matcher disagree: ${url}`);
    const query: Record<string, string[]> = {};
    for (const key of new Set(parsed.searchParams.keys())) {
      query[key] = parsed.searchParams.getAll(key);
    }
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: route.destination,
      params,
      query,
    });
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(parsedDestination.query)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        search.append(key, String(item));
      }
    }
    const qs = search.toString();
    return {
      location: `${parsedDestination.pathname}${qs ? `?${qs}` : ''}`,
      statusCode: buildCustomRoute('redirect', route as never, []).statusCode,
      internal: Boolean(route.internal),
    };
  }
  return null;
}

describe('Calendar Next deployment path', () => {
  it('retains the canonical base path through the shared config and intl plugin', () => {
    expect(nextConfig.basePath).toBe('/calendar');
    expect(nextConfig.trailingSlash).not.toBe(true);
  });

  it('keeps app auth routes ahead of the central API fallback', async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toBeDefined();
    expect(Array.isArray(rewrites)).toBe(false);
    if (!rewrites || Array.isArray(rewrites)) {
      throw new Error('Calendar requires phased rewrites');
    }
    expect(rewrites.afterFiles).toEqual([]);
    expect(rewrites.fallback).toEqual([
      expect.objectContaining({ source: '/api/:path*' }),
    ]);
  });
});

describe('Calendar legacy unprefixed paths', () => {
  it('declares exactly the temporary same-host redirects', async () => {
    expect(await nextConfig.redirects?.()).toEqual([
      {
        source: '/api/v1/calendar/auth/callback',
        destination: '/calendar/api/v1/calendar/auth/callback',
        basePath: false,
        permanent: false,
      },
      {
        source: '/api/v1/calendar/auth/microsoft/callback',
        destination: '/calendar/api/v1/calendar/auth/microsoft/callback',
        basePath: false,
        permanent: false,
      },
      {
        source: '/api/build-info',
        destination: '/calendar/api/build-info',
        basePath: false,
        permanent: false,
      },
      {
        source: '/',
        destination: '/calendar',
        basePath: false,
        permanent: false,
      },
      {
        source:
          '/:path((?!(?:calendar|api|_next|_vercel|serwist|monitoring|\\.well-known)(?:/|$)).+)',
        destination: '/calendar/:path',
        basePath: false,
        permanent: false,
      },
    ]);
  });

  it('emits every legacy redirect as an unprefixed 307', async () => {
    const { redirects } = await loadRoutes();
    const legacy = redirects.filter((route) => !route.internal);
    expect(legacy).toHaveLength(5);
    for (const route of legacy) {
      expect(route.basePath).toBe(false);
      expect(route.source.startsWith('/calendar')).toBe(false);
      expect(route.destination.startsWith('/calendar')).toBe(true);
      expect(route.destination).not.toMatch(/^[a-z]+:\/\//i);
      expect(buildCustomRoute('redirect', route as never, []).statusCode).toBe(
        307
      );
    }
  });

  it('keeps legacy redirects out of caches', async () => {
    const headers = await nextConfig.headers?.();
    const sources = (await nextConfig.redirects?.())?.map((r) => r.source);
    for (const source of sources ?? []) {
      expect(headers).toContainEqual({
        source,
        basePath: false,
        headers: NO_STORE,
      });
    }
  });

  it.each([
    ['/', '/calendar'],
    ['/personal', '/calendar/personal'],
    ['/personal?x=1&x=2', '/calendar/personal?x=1&x=2'],
    [
      '/personal?next=%2Fcalendar%2Fx&a=b',
      '/calendar/personal?next=%2Fcalendar%2Fx&a=b',
    ],
    ['/vi/personal', '/calendar/vi/personal'],
    ['/en/internal/tasks?view=week', '/calendar/en/internal/tasks?view=week'],
    ['/login?next=%2Fpersonal', '/calendar/login?next=%2Fpersonal'],
    ['/sw.js', '/calendar/sw.js'],
    ['/favicon.ico', '/calendar/favicon.ico'],
    ['/site.webmanifest', '/calendar/site.webmanifest'],
    ['/calendarx', '/calendar/calendarx'],
    ['/apis', '/calendar/apis'],
    [
      '/api/v1/calendar/auth/callback?code=c&state=s',
      '/calendar/api/v1/calendar/auth/callback?code=c&state=s',
    ],
    [
      '/api/v1/calendar/auth/microsoft/callback?code=c&state=s',
      '/calendar/api/v1/calendar/auth/microsoft/callback?code=c&state=s',
    ],
    ['/api/build-info', '/calendar/api/build-info'],
  ])('redirects %s to %s with 307', async (url, location) => {
    expect(await resolveRedirect(url)).toEqual({
      location,
      statusCode: 307,
      internal: false,
    });
  });

  it('strips a trailing slash with the built-in 308 before the legacy 307', async () => {
    expect(await resolveRedirect('/personal/?x=1')).toEqual({
      location: '/personal?x=1',
      statusCode: 308,
      internal: true,
    });
    expect(await resolveRedirect('/personal?x=1')).toEqual({
      location: '/calendar/personal?x=1',
      statusCode: 307,
      internal: false,
    });
  });

  it.each([
    '/calendar',
    '/calendar/',
    '/calendar/x',
    '/calendar/personal?x=1',
    '/Calendar/x',
    '/api',
    '/api/build-info/x',
    '/api/cron/calendar/provider-sync',
    '/api/cron/calendar/smart-schedule',
    '/api/v1/calendar/auth/callback/x',
    '/api/v1/workspaces/ws/calendar/events',
    '/api/auth/verify-app-token',
    '/_next/static/chunks/a.js',
    '/_vercel/insights/script.js',
    '/serwist/sw.js',
    '/monitoring',
    '/.well-known/security.txt',
  ])('never applies a legacy redirect to %s', async (url) => {
    const match = await resolveRedirect(url);
    expect(match === null || match.internal).toBe(true);
  });

  it('leaves the app rewrites basePath-scoped', async () => {
    const rewrites = await nextConfig.rewrites?.();
    if (!rewrites || Array.isArray(rewrites)) {
      throw new Error('Calendar requires phased rewrites');
    }
    for (const rewrite of [
      ...rewrites.beforeFiles,
      ...rewrites.afterFiles,
      ...rewrites.fallback,
    ]) {
      expect(rewrite.basePath).toBeUndefined();
    }
    const { rewrites: loaded } = await loadRoutes();
    for (const rewrite of [...loaded.beforeFiles, ...loaded.fallback]) {
      expect(rewrite.source.startsWith('/calendar/')).toBe(true);
    }
  });
});
