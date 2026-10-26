import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetsBinding } from '../core/assets';
import { createRootResponsePolicy } from '../core/response-policy';
import { cookies } from '../server/request-context';
import { routerBasepath } from './base-path';
import {
  type BridgeHandlerOptions,
  bridgeErrorResponse,
  createBridgeHandler,
} from './handler';

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

describe('a root-only artifact (no apex mount, unknown hosts rejected)', () => {
  it('rejects the apex and unknown hosts before any app code or egress', async () => {
    const hooks = {
      start: vi.fn(async () => new Response('start')),
      proxy: vi.fn(async () => NextResponse.next()),
      endpoint: vi.fn(async () => new Response('endpoint')),
      functionProxy: vi.fn(async () => NextResponse.next()),
      assets: vi.fn(async () => new Response('asset')),
      centralApiOrigin: vi.fn(() => 'https://central.example'),
      apiOrigin: vi.fn(() => undefined),
      requestInit: vi.fn((initial: Request) => initial),
      matches: vi.fn(() => true),
      csp: vi.fn(() => "default-src 'self'"),
    };
    const rootCtx = { waitUntil: vi.fn() };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const rootOnly = createBridgeHandler<Env, typeof rootCtx>({
      mounts: {
        app: 'cms',
        rootHosts: ['cms.tuturuuu.com'],
        mountHosts: [],
        basePath: '/cms',
        unknownHost: 'reject',
      },
      start: { fetch: hooks.start },
      proxy: hooks.proxy,
      endpoints: [{ pattern: '/api/own', module: { GET: hooks.endpoint } }],
      serverFnBase: '/_serverFn',
      functionBase: '/api/fn',
      functionProxy: hooks.functionProxy,
      publicAssets: new Set(['/robots.txt']),
      assets: () => ({ fetch: hooks.assets }),
      centralApiOrigin: hooks.centralApiOrigin,
      apiOrigin: hooks.apiOrigin,
      requestInit: hooks.requestInit,
      matches: hooks.matches,
      csp: hooks.csp,
    });
    for (const url of [
      'https://tuturuuu.com/cms',
      'https://tuturuuu.com/cms/en',
      'https://tuturuuu.com/cms/api/own',
      'https://tuturuuu.com/cms/api/v1/workspaces',
      'https://tuturuuu.com/cms/assets/a.js',
      'https://tuturuuu.com/cms/robots.txt',
      'https://tuturuuu.com/cms/_serverFn/x',
      'https://tuturuuu.com/',
      'https://cms-preview.workers.dev/',
    ]) {
      const response = await rootOnly(new Request(url), env, rootCtx);
      expect(response.status, url).toBe(404);
      expect(await response.text(), url).toBe('Not Found');
    }
    for (const [name, hook] of Object.entries(hooks))
      expect(hook, name).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rootCtx.waitUntil).not.toHaveBeenCalled();

    // The root host is still served (the control for the rejections above).
    const served = await rootOnly(
      new Request('https://cms.tuturuuu.com/'),
      env,
      rootCtx
    );
    expect(await served.text()).toBe('start');
    expect(hooks.start).toHaveBeenCalledOnce();
  });
});

describe('framable paths keep the upstream CSP (uploaded WebGL builds)', () => {
  const sandbox =
    'sandbox allow-scripts allow-downloads allow-pointer-lock allow-modals';
  const appCsp = (nonce: string) =>
    `default-src 'self'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`;
  const build = (
    options: Partial<BridgeHandlerOptions<Env, typeof ctx>> = {}
  ) =>
    createBridgeHandler<Env, typeof ctx>({
      mounts: {
        app: 'cms',
        rootHosts: ['cms.tuturuuu.com'],
        mountHosts: ['tuturuuu.com'],
        basePath: '/cms',
      },
      start: { fetch: async () => new Response('<html></html>') },
      proxy: async () => NextResponse.next(),
      assets: (env) => env.ASSETS,
      centralApiOrigin: () => 'https://central.example',
      // Web serves uploaded WebGL builds sandboxed.
      forwardApi: async () =>
        new Response('game', {
          headers: { 'Content-Security-Policy': sandbox },
        }),
      csp: appCsp,
      ...options,
    });
  const cspOf = async (handler: ReturnType<typeof build>, url: string) =>
    (await handler(new Request(url), env, ctx)).headers.get(
      'Content-Security-Policy'
    );
  const webgl = '/api/v1/workspaces/ws-1/external-projects/assets/a-1/webgl';

  it('passes the sandbox CSP through on the WebGL path, root and apex', async () => {
    const handler = build();
    for (const url of [
      `https://cms.tuturuuu.com${webgl}`,
      `https://cms.tuturuuu.com${webgl}/`,
      `https://cms.tuturuuu.com${webgl}/Build/game.js`,
      `https://tuturuuu.com/cms${webgl}/index.html`,
    ])
      expect(await cspOf(handler, url), url).toBe(sandbox);
  });

  it('still applies the app CSP on neighbouring and lookalike paths', async () => {
    const handler = build();
    for (const path of [
      '/api/v1/workspaces/ws-1/external-projects/assets/a-1',
      '/api/v1/workspaces/ws-1/external-projects/assets/a-1/webglx',
      '/api/v1/workspaces/ws-1/external-projects/assets/a-1/x/webgl',
      '/en',
    ]) {
      const csp = await cspOf(handler, `https://cms.tuturuuu.com${path}`);
      expect(csp, path).toMatch(/frame-ancestors 'none'$/u);
      expect(csp, path).not.toContain('sandbox');
    }
  });

  it('adds no CSP on the WebGL path when the upstream sent none', async () => {
    const handler = build({ forwardApi: async () => new Response('game') });
    expect(await cspOf(handler, `https://cms.tuturuuu.com${webgl}`)).toBeNull();
  });

  it('matches the normalized, case-sensitive path', async () => {
    const handler = build();
    for (const path of [`${webgl}/../x`, `${webgl}%2Fx`, webgl.toUpperCase()]) {
      const csp = await cspOf(handler, `https://cms.tuturuuu.com${path}`);
      expect(csp, path).toMatch(/frame-ancestors 'none'$/u);
    }
    // A dot segment that resolves into the WebGL path is that path.
    expect(
      await cspOf(
        handler,
        `https://cms.tuturuuu.com/api/v1/workspaces/ws-1/x/../external-projects/assets/a-1/webgl`
      )
    ).toBe(sandbox);
  });

  it('lets an app keep an upstream policy or add framable paths', async () => {
    const keep = build({
      csp: (nonce, { response, path }) =>
        path.startsWith('/api/') &&
        response.headers.has('Content-Security-Policy')
          ? null
          : appCsp(nonce),
    });
    expect(
      await cspOf(
        keep,
        'https://cms.tuturuuu.com/api/v1/workspaces/ws-1/external-projects/assets/a-1'
      )
    ).toBe(sandbox);
    expect(await cspOf(keep, 'https://cms.tuturuuu.com/en')).toMatch(
      /frame-ancestors 'none'$/u
    );
    const extra = build({ framablePaths: [/^\/api\/embed(?:\/|$)/u] });
    expect(await cspOf(extra, 'https://cms.tuturuuu.com/api/embed/x')).toBe(
      sandbox
    );
  });
});

describe('the bridge answers its own failures safely', () => {
  const failing = (where: 'proxy' | 'endpoint' | 'start') =>
    createBridgeHandler<Env, typeof ctx>({
      mounts: { app: 'cms', rootHosts: ['cms.tuturuuu.com'] },
      start: {
        fetch: async () => {
          if (where === 'start') throw new Error('secret start detail');
          return new Response('page');
        },
      },
      proxy: async () => {
        if (where === 'proxy') throw new Error('secret proxy detail');
        return NextResponse.next();
      },
      endpoints: [
        {
          pattern: '/api/own',
          module: {
            GET: async () => {
              throw new Error('secret endpoint detail');
            },
          },
        },
      ],
      assets: (env) => env.ASSETS,
      centralApiOrigin: () => 'https://central.example',
    });

  it('turns a thrown proxy, endpoint or Start error into a generic 500', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const [where, path] of [
      ['proxy', '/en'],
      ['endpoint', '/api/own'],
      ['start', '/en'],
    ] as const) {
      const response = await failing(where)(
        new Request(`https://cms.tuturuuu.com${path}`),
        env,
        ctx
      );
      expect(response.status, where).toBe(500);
      const body = await response.text();
      expect(body, where).toBe('Internal Server Error');
      expect(body, where).not.toContain('secret');
      expect(response.headers.get('Cache-Control'), where).toBe(
        'private, no-store'
      );
    }
    // Details go to the server log only.
    expect(logged).toHaveBeenCalled();
  });

  it('gets the full response policy when the app wraps it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const policy = createRootResponsePolicy({ seo: 'noindex, nofollow' });
    const request = new Request('https://cms.tuturuuu.com/en');
    const headers = policy(await failing('start')(request, env, ctx), {
      request,
    }).headers;
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('Vary')).toBe('Cookie');
    expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Content-Security-Policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(bridgeErrorResponse().status).toBe(500);
  });
});
