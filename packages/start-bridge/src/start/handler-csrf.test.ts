import type { CsrfMode } from '@tuturuuu/auth/csrf';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';

const ctx = { waitUntil: vi.fn() };
type Env = { CSRF_MODE: CsrfMode };

const proxy = vi.fn(async () => NextResponse.next());
const start = vi.fn(async () => new Response('start'));
const handle = createBridgeHandler<Env, typeof ctx>({
  mounts: {
    app: 'meet',
    rootHosts: ['meet.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/meet',
  },
  start: { fetch: start },
  proxy,
  endpoints: [
    {
      pattern: '/api/own',
      module: { POST: async () => new Response('own') },
    },
    {
      pattern: '/api/hooks/[name]',
      module: { POST: async () => new Response('hook') },
    },
  ],
  assets: () => undefined,
  centralApiOrigin: () => 'https://central.example',
  csrf: {
    mode: (env) => env.CSRF_MODE,
    exemptions: [{ pathname: '/api/hooks/', reason: 'signed webhook' }],
  },
});

const SESSION = 'sb-abc-auth-token=value';
const post = (url: string, mode: CsrfMode, headers: Record<string, string>) =>
  handle(
    new Request(url, { headers, method: 'POST' }),
    { CSRF_MODE: mode },
    ctx
  );

describe('bridge CSRF admission', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('refuses a sibling-subdomain mutation on a mount before proxy.ts runs', async () => {
    const response = await post(
      'https://tuturuuu.com/meet/api/own',
      'enforce',
      {
        cookie: SESSION,
        origin: 'https://evil.tuturuuu.com',
        'sec-fetch-site': 'same-site',
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'CSRF_REJECTED',
      error: 'Cross-origin request rejected',
    });
    expect(proxy).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('refuses a sibling mutation on a mount even with a junk bearer token', async () => {
    const response = await post(
      'https://tuturuuu.com/meet/api/own',
      'enforce',
      {
        authorization: 'Bearer junk',
        cookie: SESSION,
        origin: 'https://evil.tuturuuu.com',
        'sec-fetch-site': 'same-site',
      }
    );

    expect(response.status).toBe(403);
    expect(proxy).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('keeps bearer-only (no cookie) clients working on a mount', async () => {
    const response = await post(
      'https://tuturuuu.com/meet/api/own',
      'enforce',
      {
        authorization: 'Bearer eyJ.token',
        'sec-fetch-site': 'cross-site',
      }
    );

    expect(await response.text()).toBe('own');
  });

  it('admits a same-origin mutation on a mount', async () => {
    const response = await post(
      'https://tuturuuu.com/meet/api/own',
      'enforce',
      {
        cookie: SESSION,
        origin: 'https://tuturuuu.com',
        'sec-fetch-site': 'same-origin',
      }
    );

    expect(await response.text()).toBe('own');
  });

  it('checks Origin against the apex when Fetch Metadata is absent', async () => {
    const ok = await post('https://tuturuuu.com/meet/api/own', 'enforce', {
      cookie: SESSION,
      origin: 'https://tuturuuu.com',
    });
    const refused = await post('https://tuturuuu.com/meet/api/own', 'enforce', {
      cookie: SESSION,
      origin: 'https://meet.tuturuuu.com',
    });

    expect(await ok.text()).toBe('own');
    expect(refused.status).toBe(403);
  });

  it('applies app-relative exemptions', async () => {
    const response = await post(
      'https://tuturuuu.com/meet/api/hooks/provider',
      'enforce',
      { cookie: SESSION, 'sec-fetch-site': 'cross-site' }
    );

    expect(await response.text()).toBe('hook');
    expect(proxy).toHaveBeenCalled();
  });

  it.each(['report', 'off'] as const)(
    'enforces a mount even when the app mode is %s',
    async (mode) => {
      const response = await post('https://tuturuuu.com/meet/api/own', mode, {
        cookie: SESSION,
        'sec-fetch-site': 'cross-site',
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'CSRF_REJECTED' });
    }
  );

  it('still admits a same-origin mount mutation when the app mode is off', async () => {
    const response = await post('https://tuturuuu.com/meet/api/own', 'off', {
      cookie: SESSION,
      'sec-fetch-site': 'same-origin',
    });

    expect(await response.text()).toBe('own');
  });

  it('leaves root-mode (subdomain) requests to the app, even in enforce mode', async () => {
    const response = await post(
      'https://meet.tuturuuu.com/api/own',
      'enforce',
      {
        cookie: SESSION,
        'sec-fetch-site': 'cross-site',
      }
    );

    expect(await response.text()).toBe('own');
  });

  it('leaves root-mode requests to the app when the mode is off', async () => {
    const response = await post('https://meet.tuturuuu.com/api/own', 'off', {
      cookie: SESSION,
      'sec-fetch-site': 'cross-site',
    });

    expect(await response.text()).toBe('own');
  });
});

describe('mounted logout dispatch effects', () => {
  const paths = [
    '/api/auth/logout',
    '/api/auth//logout',
    '/api/auth/logout//',
    '/api/auth/%6Cogout',
    '/api/auth/logout%2F',
    '/api/auth/./logout',
  ];
  it.each(['off', 'report', 'enforce'] as const)(
    'guards aliases before effects in %s mode',
    async (mode) => {
      const forward = vi.fn(
        async () =>
          new Response('Web logout', {
            headers: { 'Set-Cookie': 'sb-abc-auth-token=; Path=/; Max-Age=0' },
          })
      );
      const local = vi.fn(async () => new Response('local logout'));
      const middleware = vi.fn(async () => NextResponse.next());
      const dispatch = createBridgeHandler<Env, typeof ctx>({
        mounts: {
          app: 'meet',
          rootHosts: ['meet.tuturuuu.com'],
          mountHosts: ['tuturuuu.com'],
          basePath: '/meet',
        },
        start: { fetch: start },
        proxy: middleware,
        endpoints: [{ pattern: '/api/auth/logout', module: { POST: local } }],
        assets: () => undefined,
        centralApiOrigin: () => 'https://central.example',
        forwardApi: forward,
        csrf: { mode: (env) => env.CSRF_MODE },
      });
      for (const path of paths) {
        for (const cookie of [undefined, SESSION]) {
          for (const authorization of [undefined, 'Bearer junk']) {
            for (const method of ['POST', 'GET']) {
              forward.mockClear();
              local.mockClear();
              middleware.mockClear();
              const headers = new Headers({ 'sec-fetch-site': 'cross-site' });
              if (cookie) headers.set('cookie', cookie);
              if (authorization) headers.set('authorization', authorization);
              const response = await dispatch(
                new Request(`https://tuturuuu.com/meet${path}`, {
                  method,
                  headers,
                }),
                { CSRF_MODE: mode },
                ctx
              );
              expect([403, 405]).toContain(response.status);
              expect(response.headers.getSetCookie()).toEqual([]);
              expect(forward).not.toHaveBeenCalled();
              expect(local).not.toHaveBeenCalled();
              expect(middleware).not.toHaveBeenCalled();
            }
          }
        }
        forward.mockClear();
        const admitted = await dispatch(
          new Request(`https://tuturuuu.com/meet${path}`, {
            method: 'POST',
            headers: { 'sec-fetch-site': 'same-origin' },
          }),
          { CSRF_MODE: mode },
          ctx
        );
        expect(forward).toHaveBeenCalledTimes(1);
        expect(admitted.headers.getSetCookie()).toEqual([
          'sb-abc-auth-token=; Path=/; Max-Age=0',
        ]);
        expect(local).not.toHaveBeenCalled();
      }
    }
  );
});

describe('mounted case-sensitive dispatch', () => {
  it.each(['/api/auth/Logout', '/api/auth/LOGOUT', '/API/auth/logout'])(
    'does not dispatch %s to logout or delete cookies',
    async (path) => {
      const { dispatchEndpoint } = await import('../core/endpoints');
      const logout = vi.fn(
        async () =>
          new Response('logout', {
            headers: { 'Set-Cookie': 'session=; Max-Age=0' },
          })
      );
      const forward = vi.fn(
        async (request: Request) =>
          (await dispatchEndpoint(
            [{ pattern: '/api/auth/logout', module: { POST: logout } }],
            request
          )) ?? new Response('Not Found', { status: 404 })
      );
      const dispatch = createBridgeHandler<Env, typeof ctx>({
        mounts: {
          app: 'meet',
          rootHosts: ['meet.tuturuuu.com'],
          mountHosts: ['tuturuuu.com'],
          basePath: '/meet',
        },
        start: {
          fetch: async () => new Response('Not Found', { status: 404 }),
        },
        proxy: async () => NextResponse.next(),
        assets: () => undefined,
        centralApiOrigin: () => 'https://central.example',
        forwardApi: forward,
      });
      const response = await dispatch(
        new Request(`https://tuturuuu.com/meet${path}`, { method: 'POST' }),
        { CSRF_MODE: 'off' },
        ctx
      );
      expect(response.status).toBe(404);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(logout).not.toHaveBeenCalled();
      expect(forward).toHaveBeenCalledTimes(path.startsWith('/api/') ? 1 : 0);
    }
  );
});

describe('mounted non-session encoded parameters', () => {
  it.each(['off', 'report', 'enforce'] as const)(
    'dispatches in %s mode',
    async (mode) => {
      const local = vi.fn(async () => new Response('dynamic'));
      const forward = vi.fn(async () => new Response('unexpected forward'));
      const dispatch = createBridgeHandler<Env, typeof ctx>({
        mounts: {
          app: 'meet',
          rootHosts: ['meet.tuturuuu.com'],
          mountHosts: ['tuturuuu.com'],
          basePath: '/meet',
        },
        start: { fetch: start },
        proxy: async () => NextResponse.next(),
        endpoints: [
          {
            pattern: '/api/v1/things/[name]',
            module: { GET: local, POST: local },
          },
        ],
        assets: () => undefined,
        centralApiOrigin: () => 'https://central.example',
        forwardApi: forward,
        csrf: { mode: (env) => env.CSRF_MODE },
      });
      for (const suffix of ['discount%25', 'question%3F', 'fragment%23']) {
        for (const [method, headers] of [
          ['GET', { origin: 'https://tuturuuu.com' }],
          ['POST', { authorization: 'Bearer junk' }],
          [
            'POST',
            {
              cookie: SESSION,
              origin: 'https://tuturuuu.com',
              'sec-fetch-site': 'same-origin',
            },
          ],
        ] as const) {
          local.mockClear();
          const response = await dispatch(
            new Request(`https://tuturuuu.com/meet/api/v1/things/${suffix}`, {
              method,
              headers,
            }),
            { CSRF_MODE: mode },
            ctx
          );
          expect(response.status).toBe(200);
          expect(await response.text()).toBe('dynamic');
          expect(local).toHaveBeenCalledOnce();
          expect(forward).not.toHaveBeenCalled();
          expect(response.headers.getSetCookie()).toEqual([]);
        }
      }
    }
  );
});

describe('mounted double-encoded logout paths', () => {
  it.each(['off', 'report', 'enforce'] as const)(
    'refuses before effects in %s mode',
    async (mode) => {
      const local = vi.fn(
        async () =>
          new Response('logout', {
            headers: { 'Set-Cookie': 'session=; Max-Age=0' },
          })
      );
      const forward = vi.fn(
        async () =>
          new Response('Web logout', {
            headers: { 'Set-Cookie': 'session=; Max-Age=0' },
          })
      );
      const middleware = vi.fn(async () => NextResponse.next());
      const dispatch = createBridgeHandler<Env, typeof ctx>({
        mounts: {
          app: 'meet',
          rootHosts: ['meet.tuturuuu.com'],
          mountHosts: ['tuturuuu.com'],
          basePath: '/meet',
        },
        start: { fetch: start },
        proxy: middleware,
        endpoints: [
          { pattern: '/api/auth/logout', module: { GET: local, POST: local } },
        ],
        assets: () => undefined,
        centralApiOrigin: () => 'https://central.example',
        forwardApi: forward,
        csrf: { mode: (env) => env.CSRF_MODE },
      });
      for (const path of ['/api/auth/logout%252F', '/api/auth/%256Cogout']) {
        for (const method of ['GET', 'POST']) {
          const response = await dispatch(
            new Request(`https://tuturuuu.com/meet${path}`, {
              method,
              headers: {
                origin: 'https://tuturuuu.com',
                'sec-fetch-site': 'same-origin',
              },
            }),
            { CSRF_MODE: mode },
            ctx
          );
          expect(response.status).toBe(400);
          expect(response.headers.getSetCookie()).toEqual([]);
          expect(local).not.toHaveBeenCalled();
          expect(forward).not.toHaveBeenCalled();
          expect(middleware).not.toHaveBeenCalled();
        }
      }
    }
  );
});
