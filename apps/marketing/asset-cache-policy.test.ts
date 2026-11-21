// @vitest-environment node
import { expect, it, vi } from 'vitest';
import marketing from './start-bridge.config';

vi.mock('./src/lib/landing-style-map.json', () => ({
  default: {
    '/assets/layout-DAf1do_a.css': {
      critical: '/assets/landing-critical-48f5315d33d4.css',
      remaining: '/assets/landing-rest-189cedac9797.css',
    },
  },
}));

const revalidate = 'public, max-age=0, must-revalidate';
const immutable = 'public, max-age=31536000, immutable';

async function cacheControl({
  path,
  contentType = 'text/css',
  status = 200,
  setCookie,
  cache = revalidate,
  publicFile = false,
}: {
  path: string;
  contentType?: string;
  status?: number;
  setCookie?: string;
  cache?: string;
  publicFile?: boolean;
}) {
  const response = new Response(null, {
    status,
    headers: {
      'cache-control': cache,
      'content-type': contentType,
      ...(setCookie ? { 'set-cookie': setCookie } : {}),
    },
  });
  const result = await marketing.wrapResponse?.(response, {
    request: new Request(`https://tuturuuu.com${path}`),
    mounts: { mountHosts: ['tuturuuu.com'], basePath: '/marketing' },
    publicAssets: new Set(publicFile ? [path] : []),
  });
  return result?.headers.get('cache-control');
}

it.each([
  ['/assets/landing-critical-48f5315d33d4.css', 'text/css'],
  ['/marketing/assets/landing-rest-189cedac9797.css', 'text/css'],
])('caches fingerprinted asset %s immutably', async (path, contentType) => {
  expect(await cacheControl({ path, contentType })).toBe(immutable);
});

it.each([
  { path: '/assets/main.js' },
  { path: '/assets/runtime-polyfill.js', contentType: 'text/javascript' },
  { path: '/assets/layout-DAf1do_a.css' },
  { path: '/assets/landing-critical-000000000000.css' },
  { path: '/assets/landing-critical-48f5315d33d4.css', status: 404 },
  { path: '/assets/landing-critical-48f5315d33d4.css', publicFile: true },
  { path: '/assets/landing-critical-48f5315d33d4.css', setCookie: 'fixture=1' },
])('preserves revalidation on $path', async (fixture) => {
  expect(await cacheControl(fixture)).toBe(revalidate);
});

it('keeps private and HTML responses private', async () => {
  const path = '/assets/landing-critical-48f5315d33d4.css';
  const cache = 'private, no-store';
  expect(await cacheControl({ path, cache })).toBe(cache);
  expect(await cacheControl({ path, contentType: 'text/html' })).toBe(cache);
});
