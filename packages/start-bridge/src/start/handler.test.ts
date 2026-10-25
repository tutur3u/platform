import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookies } from '../server/request-context';
import type { AssetsBinding } from '../core/assets';
import { routerBasepath } from './base-path';
import { createBridgeHandler } from './handler';

const ctx = { waitUntil: vi.fn() };
type Env = { ASSETS: AssetsBinding };

afterEach(() => {
  vi.restoreAllMocks();
});

// One handler instance stands in for one compiled artifact.
const assets = vi.fn(async (input: string) => new Response(input));
const start = vi.fn(async (request: Request) => {
  (await cookies()).set('tuturuuu_app_session', 'fresh', { path: '/' });
  const mount = request.headers.get('x-tuturuuu-app-base') ?? '-';
  return new Response(
    `start ${new URL(request.url).pathname} basepath=${routerBasepath()} mount=${mount}`
  );
});
const handle = createBridgeHandler<Env, typeof ctx>({
  mounts: {
    app: 'meet',
    rootHosts: ['meet.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/meet',
  },
  start: { fetch: start },
  proxy: async (request) => {
    if (request.nextUrl.pathname === '/private')
      return NextResponse.redirect(new URL('/login', 'https://x.test'));
    if (request.nextUrl.pathname === '/relative')
      return new NextResponse(null, {
        status: 307,
        headers: { location: '/login' },
      });
    return NextResponse.next();
  },
  endpoints: [
    {
      pattern: '/api/workspaces/[wsId]',
      module: { GET: async () => new Response('local workspace') },
    },
    {
      pattern: '/api/v1/[wsId]/settings/[configId]',
      module: { GET: async () => new Response('local setting') },
    },
    {
      pattern: '/api/own',
      module: {
        GET: async (request: Request) =>
          new Response(new URL(request.url).pathname),
      },
    },
  ],
  serverFnBase: '/_serverFn',
  centralFirst: [
    '/api/workspaces/invitations',
    '/api/v1/:wsId/settings/permissions',
  ],
  publicAssets: new Set(['/robots.txt']),
  assets: (env) => env.ASSETS,
  centralApiOrigin: () => 'https://central.example',
});
const env: Env = { ASSETS: { fetch: assets } };
const get = (url: string, init?: RequestInit) =>
  handle(new Request(url, init), env, ctx);

describe('one artifact at the subdomain root', () => {
  it('serves assets, endpoints, server functions and pages unchanged', async () => {
    expect(
      await (await get('https://meet.tuturuuu.com/assets/a.js')).text()
    ).toBe('https://meet.tuturuuu.com/assets/a.js');
    expect(await (await get('https://meet.tuturuuu.com/api/own')).text()).toBe(
      '/api/own'
    );
    expect(
      await (await get('https://meet.tuturuuu.com/_serverFn/abc')).text()
    ).toBe('start /_serverFn/abc basepath=/ mount=-');
    const page = await get('https://meet.tuturuuu.com/r/abc');
    expect(await page.text()).toBe('start /r/abc basepath=/ mount=-');
    expect(page.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session=fresh; Path=/',
    ]);
    const relative = await get('https://meet.tuturuuu.com/relative');
    expect(relative.headers.get('location')).toBe('/login');
  });
});

describe('the same artifact mounted at tuturuuu.com/meet', () => {
  it('refuses apex paths outside the mount', async () => {
    expect((await get('https://tuturuuu.com/calendar')).status).toBe(404);
    expect((await get('https://tuturuuu.com/meetings')).status).toBe(404);
  });

  it('strips the base for assets and server functions, keeps it for pages', async () => {
    expect(
      await (await get('https://tuturuuu.com/meet/robots.txt')).text()
    ).toBe('https://tuturuuu.com/robots.txt');
    expect(await (await get('https://tuturuuu.com/meet/api/own')).text()).toBe(
      '/meet/api/own'
    );
    expect(
      await (await get('https://tuturuuu.com/meet/_serverFn/abc')).text()
    ).toBe('start /_serverFn/abc basepath=/meet mount=/meet');
    const page = await get('https://tuturuuu.com/meet/r/abc');
    expect(await page.text()).toBe(
      'start /meet/r/abc basepath=/meet mount=/meet'
    );
    // The shared session cookie is never renamed or path-scoped.
    expect(page.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session=fresh; Path=/',
    ]);
  });

  it('replaces a client-sent mount header with the resolved one', async () => {
    const spoofed = { headers: { 'x-tuturuuu-app-base': '/evil' } };
    expect(
      await (await get('https://tuturuuu.com/meet/r/a', spoofed)).text()
    ).toBe('start /meet/r/a basepath=/meet mount=/meet');
    expect(
      await (await get('https://meet.tuturuuu.com/r/a', spoofed)).text()
    ).toBe('start /r/a basepath=/ mount=-');
  });

  it('prefixes path-relative middleware redirects and leaves absolute ones', async () => {
    expect(
      (await get('https://tuturuuu.com/meet/relative')).headers.get('location')
    ).toBe('/meet/login');
    expect(
      (await get('https://tuturuuu.com/meet/private')).headers.get('location')
    ).toBe('https://x.test/login');
  });

  it('forwards unowned API calls to the central API without the base', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => new Response((input as Request).url)
    );
    const response = await get('https://tuturuuu.com/meet/api/v1/x?y=1');
    expect(await response.text()).toBe('https://central.example/api/v1/x?y=1');
  });
});

describe('Web-first API precedence', () => {
  it('sends centralFirst paths to Web before local endpoints, in both mounts', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => new Response(`central ${(input as Request).url}`)
    );
    expect(
      await (
        await get('https://meet.tuturuuu.com/api/workspaces/invitations')
      ).text()
    ).toBe('central https://central.example/api/workspaces/invitations');
    expect(
      await (
        await get('https://tuturuuu.com/meet/api/v1/ws1/settings/permissions')
      ).text()
    ).toBe('central https://central.example/api/v1/ws1/settings/permissions');
    expect(
      await (await get('https://meet.tuturuuu.com/api/workspaces/ws1')).text()
    ).toBe('local workspace');
    expect(
      await (
        await get('https://meet.tuturuuu.com/api/v1/ws1/settings/theme')
      ).text()
    ).toBe('local setting');
  });
});
