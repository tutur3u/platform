// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGACY_DOCUMENT_SOURCE } from './src/lib/legacy-root-routes';

const vercelConfig = JSON.parse(
  readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')
) as Record<string, unknown> & {
  routes?: { src: string; dest: string; continue?: boolean }[];
};

// Vercel route `src` values are PCRE and case-insensitive by default.
function applyRoutes(pathname: string) {
  for (const route of vercelConfig.routes ?? []) {
    const match = new RegExp(route.src, 'i').exec(pathname);
    if (!match) continue;
    return route.dest.replace(/\$(\d+)/gu, (_, index: string) =>
      String(match[Number(index)] ?? '')
    );
  }
  return null;
}

describe('Calendar Vercel platform routing', () => {
  it('serves unprefixed API paths in place ahead of the framework routes', () => {
    expect(vercelConfig.routes).toEqual([
      {
        src: '^/api/(.*)$',
        dest: '/calendar/api/$1',
        continue: true,
      },
    ]);
  });

  it('keeps routing in `routes` only and declares no crons', () => {
    // `routes` cannot be combined with these keys, and `rewrites` would
    // compile to a `check` route that skips the Next proxy.
    for (const key of [
      'rewrites',
      'redirects',
      'headers',
      'cleanUrls',
      'trailingSlash',
      'crons',
    ]) {
      expect(vercelConfig).not.toHaveProperty(key);
    }
  });

  it.each([
    [
      '/api/cron/calendar/provider-sync',
      '/calendar/api/cron/calendar/provider-sync',
    ],
    [
      '/api/cron/calendar/smart-schedule',
      '/calendar/api/cron/calendar/smart-schedule',
    ],
    [
      '/api/v1/workspaces/ws/calendar/events',
      '/calendar/api/v1/workspaces/ws/calendar/events',
    ],
    [
      '/api/v1/workspaces/ws/calendar/events/ev',
      '/calendar/api/v1/workspaces/ws/calendar/events/ev',
    ],
    [
      '/api/v1/calendar/auth/callback',
      '/calendar/api/v1/calendar/auth/callback',
    ],
    ['/api/build-info', '/calendar/api/build-info'],
    ['/api/auth/verify-app-token', '/calendar/api/auth/verify-app-token'],
  ])('rewrites %s in place to %s', (pathname, destination) => {
    expect(applyRoutes(pathname)).toBe(destination);
  });

  it.each([
    '/calendar/api/build-info',
    '/calendar',
    '/',
    '/personal',
    '/api',
    '/apix/y',
    '/_next/static/a.js',
  ])('leaves %s to the framework routes', (pathname) => {
    expect(applyRoutes(pathname)).toBeNull();
  });

  it('never rewrites a path the Next document redirect handles', () => {
    expect(LEGACY_DOCUMENT_SOURCE).toContain('api');
    expect(applyRoutes('/personal')).toBeNull();
  });
});
