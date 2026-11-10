import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetsBinding } from '../core/assets';
import { createRootResponsePolicy } from '../core/response-policy';
import { requestNonce } from '../core/csp';
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
    // A mounted app never writes a per-app session cookie on the apex.
    expect(page.headers.getSetCookie()).toEqual([]);
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
    // Without an upstream policy, only the framable path is left bare.
    const handler = build({ forwardApi: async () => new Response('page') });
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
    const bare = build({ forwardApi: async () => new Response('page') });
    for (const path of [`${webgl}/../x`, `${webgl}%2Fx`, webgl.toUpperCase()]) {
      const csp = await cspOf(bare, `https://cms.tuturuuu.com${path}`);
      expect(csp, path).toMatch(/frame-ancestors 'none'$/u);
    }
    expect(await cspOf(bare, `https://cms.tuturuuu.com${webgl}`)).toBeNull();
    const handler = build();
    // A dot segment that resolves into the WebGL path is that path.
    expect(
      await cspOf(
        handler,
        `https://cms.tuturuuu.com/api/v1/workspaces/ws-1/x/../external-projects/assets/a-1/webgl`
      )
    ).toBe(sandbox);
  });

  it('never replaces a policy the response already carries (HTML forwarded from Web)', async () => {
    const own = "sandbox; default-src 'none'";
    const handler = build({
      forwardApi: async () =>
        new Response('<!doctype html><p>copy this token</p>', {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': own,
          },
        }),
    });
    for (const url of [
      'https://cms.tuturuuu.com/api/cli/auth/copy-token',
      'https://tuturuuu.com/cms/api/v1/sso/saml/post-response',
      'https://cms.tuturuuu.com/api/v1/unsubscribe',
    ])
      expect(await cspOf(handler, url), url).toBe(own);
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

describe('one framable pattern shared by the handler and the policy', () => {
  it('agrees on every request even with a g-flagged RegExp', async () => {
    const embed = /^\/api\/embed(?:\/|$)/gu;
    const framablePaths = [embed];
    const handler = createBridgeHandler<Env, typeof ctx>({
      mounts: { app: 'cms', rootHosts: ['cms.tuturuuu.com'] },
      start: { fetch: async () => new Response('<html></html>') },
      proxy: async () => NextResponse.next(),
      assets: (env) => env.ASSETS,
      centralApiOrigin: () => 'https://central.example',
      forwardApi: async () =>
        new Response('widget', {
          headers: {
            'Content-Security-Policy': 'sandbox allow-scripts',
            'X-Frame-Options': 'SAMEORIGIN',
          },
        }),
      csp: (nonce) => `script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
      framablePaths,
    });
    const policy = createRootResponsePolicy({ seo: 'noindex' });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const request = new Request('https://cms.tuturuuu.com/api/embed/w1');
      const headers = policy(await handler(request, env, ctx), {
        request,
        framablePaths,
      }).headers;
      expect(headers.get('Content-Security-Policy'), `#${attempt}`).toBe(
        'sandbox allow-scripts'
      );
      expect(headers.get('X-Frame-Options'), `#${attempt}`).toBeNull();
    }
    expect(embed.lastIndex).toBe(0);
  });
});

describe('mounted no-writer guard', () => {
  const guarded = createBridgeHandler<Env, typeof ctx>({
    mounts: {
      app: 'learn',
      rootHosts: ['learn.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/learn',
    },
    start: {
      fetch: async () => {
        const response = new Response('page');
        for (const value of [
          'tuturuuu_app_session=a; Path=/; HttpOnly',
          'tuturuuu_app_session_refresh=b; Path=/; HttpOnly',
          'tuturuuu_web_app_session=; Path=/; Max-Age=0',
          'tuturuuu_web_app_session_refresh=; Path=/; Max-Age=0',
          'NEXT_LOCALE=vi; Path=/',
        ]) {
          response.headers.append('set-cookie', value);
        }
        response.headers.set('service-worker-allowed', '/');
        return response;
      },
    },
    proxy: async () => NextResponse.next(),
    endpoints: [
      {
        pattern: '/api/auth/verify-app-token',
        module: { POST: async () => new Response('minted') },
      },
      {
        pattern: '/api/auth/refresh-app-session',
        module: { POST: async () => new Response('refreshed') },
      },
      {
        pattern: '/api/auth/logout',
        module: { POST: async () => new Response('app logout') },
      },
    ],
    assets: (current) => current.ASSETS,
    centralApiOrigin: () => 'https://central.example',
  });
  const call = (url: string, init?: RequestInit) =>
    guarded(new Request(url, init), env, ctx);

  it.each([
    '/learn/api/auth/verify-app-token',
    '/learn/api/auth/refresh-app-session',
    '/learn/api/auth/refresh-app-session/',
  ])('refuses %s on the apex with 409 and no Set-Cookie', async (path) => {
    const response = await call(`https://tuturuuu.com${path}`, {
      method: 'POST',
      body: '{}',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'APP_SESSION_MOUNTED',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('keeps the session endpoints at the subdomain root', async () => {
    const minted = await call(
      'https://learn.tuturuuu.com/api/auth/verify-app-token',
      { method: 'POST', body: '{}' }
    );
    expect(await minted.text()).toBe('minted');
    const refreshed = await call(
      'https://learn.tuturuuu.com/api/auth/refresh-app-session',
      { method: 'POST', body: '{}' }
    );
    expect(await refreshed.text()).toBe('refreshed');
  });

  it('drops per-app session writes and deletions on mounted responses only', async () => {
    const mounted = await call('https://tuturuuu.com/learn/courses');
    expect(await mounted.text()).toBe('page');
    expect(mounted.headers.getSetCookie()).toEqual(['NEXT_LOCALE=vi; Path=/']);
    expect(mounted.headers.has('service-worker-allowed')).toBe(false);

    const root = await call('https://learn.tuturuuu.com/courses');
    expect(root.headers.getSetCookie()).toHaveLength(5);
    expect(root.headers.get('service-worker-allowed')).toBe('/');
  });

  it('never switches modes on a client-sent mount header', async () => {
    const spoofed = await call(
      'https://learn.tuturuuu.com/api/auth/verify-app-token',
      {
        method: 'POST',
        body: '{}',
        headers: { 'x-tuturuuu-app-base': '/learn' },
      }
    );
    expect(spoofed.status).toBe(200);
    const page = await call('https://learn.tuturuuu.com/courses', {
      headers: { 'x-tuturuuu-app-base': '/learn' },
    });
    expect(page.headers.getSetCookie()).toHaveLength(5);
  });

  it('sends a mounted logout to Web, and keeps the app logout at the root', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const request = input as Request;
      return new Response(`${request.method} ${request.url}`);
    });
    const mounted = await call('https://tuturuuu.com/learn/api/auth/logout', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(await mounted.text()).toBe(
      'POST https://central.example/api/auth/logout'
    );
    const root = await call('https://learn.tuturuuu.com/api/auth/logout', {
      method: 'POST',
    });
    expect(await root.text()).toBe('app logout');
  });

  it('only takes a same-origin POST logout on a mount, cookie or not', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('web logout'));
    for (const path of ['/learn/api/auth/logout', '/learn/api/auth/logout/']) {
      const url = `https://tuturuuu.com${path}`;
      for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
        const refused = await call(url, { method });
        expect(refused.status).toBe(405);
        expect(refused.headers.get('allow')).toBe('POST');
      }
      for (const headers of [
        { cookie: 'sb-ref-auth-token=x', 'sec-fetch-site': 'cross-site' },
        { 'sec-fetch-site': 'cross-site' },
        { 'sec-fetch-site': 'same-site' },
        { origin: 'https://evil.tuturuuu.com' },
        {},
      ]) {
        const forged = await call(url, { method: 'POST', headers });
        expect(forged.status).toBe(403);
      }
      expect(fetchSpy).not.toHaveBeenCalled();

      const own = await call(url, {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
      });
      expect(await own.text()).toBe('web logout');
      const byOrigin = await call(url, {
        method: 'POST',
        headers: { origin: 'https://tuturuuu.com' },
      });
      expect(await byOrigin.text()).toBe('web logout');
      fetchSpy.mockClear();
    }
  });
});

describe('the one-origin switch TTR_ONE_ORIGIN_<APP>', () => {
  const nav = (url: string, flag?: Record<string, string>) =>
    handle(
      new Request(url, {
        headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html' },
      }),
      { ...env, ...flag } as Env,
      ctx
    );

  it('changes nothing while the variable is unset', async () => {
    expect((await nav('https://tuturuuu.com/meet/r/abc')).status).toBe(200);
    expect((await nav('https://meet.tuturuuu.com/r/abc')).status).toBe(200);
  });

  it('refuses the shared origin while off and serves the subdomain', async () => {
    const flag = { TTR_ONE_ORIGIN_MEET: 'off' };
    expect((await nav('https://tuturuuu.com/meet/r/abc', flag)).status).toBe(
      404
    );
    expect((await nav('https://meet.tuturuuu.com/r/abc', flag)).status).toBe(
      200
    );
  });

  it('serves the shared origin noindex in shadow, without redirecting', async () => {
    const flag = { TTR_ONE_ORIGIN_MEET: 'shadow' };
    const apex = await nav('https://tuturuuu.com/meet/r/abc', flag);
    expect(apex.status).toBe(200);
    expect(apex.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const sub = await nav('https://meet.tuturuuu.com/r/abc', flag);
    expect(sub.status).toBe(200);
  });

  it('redirects subdomain navigations once on, 307 then 301, no trailing slash', async () => {
    const on = { TTR_ONE_ORIGIN_MEET: 'on' };
    const first = await nav('https://meet.tuturuuu.com/r/abc?x=1', on);
    expect(first.status).toBe(307);
    expect(first.headers.get('location')).toBe(
      'https://tuturuuu.com/meet/r/abc?x=1'
    );
    const promoted = await nav('https://meet.tuturuuu.com/r/abc', {
      ...on,
      TTR_ONE_ORIGIN_MEET_REDIRECT_STATUS: '301',
    });
    expect(promoted.status).toBe(301);
    expect((await nav('https://tuturuuu.com/meet/r/abc', on)).status).toBe(200);
  });

  it('never redirects machine paths on the subdomain', async () => {
    const on = { TTR_ONE_ORIGIN_MEET: 'on' };
    const asset = await nav('https://meet.tuturuuu.com/assets/a.js', on);
    expect(asset.status).toBe(200);
    const api = await nav('https://meet.tuturuuu.com/api/own', on);
    expect(api.status).toBe(200);
  });
});

describe('one nonce per response', () => {
  it('stamps the header nonce on the rendered markup, fresh per response', async () => {
    const handler = createBridgeHandler<Env, typeof ctx>({
      start: {
        fetch: async () =>
          new Response(
            `<!doctype html><script nonce="${requestNonce()}">1</script>`,
            { headers: { 'Content-Type': 'text/html' } }
          ),
      },
      proxy: async () => NextResponse.next(),
      assets: (current) => current.ASSETS,
      centralApiOrigin: () => 'https://central.example',
      csp: (nonce) => `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    });
    const nonces = new Set<string>();
    for (let index = 0; index < 3; index += 1) {
      const response = await handler(
        new Request('https://app.test/page'),
        env,
        ctx
      );
      const header = /'nonce-([^']+)'/u.exec(
        response.headers.get('content-security-policy') ?? ''
      )?.[1];
      const markup = /nonce="([^"]+)"/u.exec(await response.text())?.[1];
      expect(header).toBeTruthy();
      expect(markup).toBe(header);
      nonces.add(header!);
    }
    expect(nonces.size).toBe(3);
  });
});
