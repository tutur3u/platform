import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifest } from './manifest';
import worker, { type CacheLike, createHandler, type Env } from './worker';

class MemoryCache implements CacheLike {
  entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

const ENV: Env = {
  WEB_ORIGIN: 'https://web-origin.vercel.app',
  PUBLIC_HOST: 'tuturuuu.com',
};

function setup(origin: (request: Request) => Response | Promise<Response>) {
  const cache = new MemoryCache();
  let now = 1_000_000;
  const fetchMock = vi.fn(async (input: Request) => origin(input));
  vi.stubGlobal('fetch', fetchMock);
  const handle = createHandler({
    cache: () => cache,
    now: () => now,
    manifest,
  });
  return {
    cache,
    fetchMock,
    advance: (seconds: number) => {
      now += seconds * 1000;
    },
    call: (path: string, init?: RequestInit, env: Env = ENV) =>
      handle(new Request(`https://tuturuuu.com${path}`, init), env),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('gateway handler', () => {
  it('caches anonymous public pages: MISS then HIT without Set-Cookie', async () => {
    const t = setup(() => new Response('<h1>about</h1>'));
    const first = await t.call('/about');
    expect(first.headers.get('x-gateway-cache')).toBe('MISS');
    expect(await first.text()).toBe('<h1>about</h1>');
    const second = await t.call('/about');
    expect(second.headers.get('x-gateway-cache')).toBe('HIT');
    expect(await second.text()).toBe('<h1>about</h1>');
    expect(second.headers.has('set-cookie')).toBe(false);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    expect(t.fetchMock.mock.calls[0]?.[0].url).toBe(
      'https://web-origin.vercel.app/about'
    );
  });

  it('answers HEAD from the GET entry', async () => {
    const t = setup(() => new Response('body'));
    await t.call('/about');
    const head = await t.call('/about', { method: 'HEAD' });
    expect(head.headers.get('x-gateway-cache')).toBe('HIT');
    expect(await head.text()).toBe('');
  });

  it('never stores a response carrying Set-Cookie', async () => {
    const t = setup(
      () => new Response('x', { headers: { 'set-cookie': 'a=1; Path=/' } })
    );
    const first = await t.call('/about');
    expect(first.headers.get('x-gateway-cache')).toBe('BYPASS');
    expect(first.headers.get('set-cookie')).toBe('a=1; Path=/');
    expect(first.headers.get('x-gateway-bypass')).toBe('set-cookie');
    expect(t.cache.entries.size).toBe(0);
  });

  it('stores a NEXT_LOCALE-only page without the cookie and still sets it on the miss', async () => {
    const t = setup(
      () =>
        new Response('page', {
          headers: { 'set-cookie': 'NEXT_LOCALE=en; Path=/; SameSite=lax' },
        })
    );
    const first = await t.call('/about');
    expect(first.headers.get('x-gateway-cache')).toBe('MISS');
    expect(first.headers.get('set-cookie')).toBe(
      'NEXT_LOCALE=en; Path=/; SameSite=lax'
    );
    expect(t.cache.entries.size).toBe(1);
    const second = await t.call('/about');
    expect(second.headers.get('x-gateway-cache')).toBe('HIT');
    expect(second.headers.has('set-cookie')).toBe(false);
  });

  it('bypasses cache for auth cookies and Authorization, keeping them intact', async () => {
    const t = setup(() => new Response('private'));
    const withCookie = await t.call('/about', {
      headers: { cookie: 'sb-x-auth-token=1' },
    });
    expect(withCookie.headers.get('x-gateway-cache')).toBe('BYPASS');
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.headers.get('cookie')).toBe('sb-x-auth-token=1');
    await t.call('/about', { headers: { authorization: 'Bearer t' } });
    expect(t.cache.entries.size).toBe(0);
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves stale within the hour and refreshes in the background', async () => {
    let body = 'v1';
    const t = setup(() => new Response(body));
    await t.call('/about');
    body = 'v2';
    t.advance(400);
    const stale = await t.call('/about');
    expect(stale.headers.get('x-gateway-cache')).toBe('STALE');
    expect(await stale.text()).toBe('v1');
    await vi.waitFor(() => expect(t.fetchMock).toHaveBeenCalledTimes(2));
    const fresh = await t.call('/about');
    expect(fresh.headers.get('x-gateway-cache')).toBe('HIT');
    expect(await fresh.text()).toBe('v2');
  });

  it('passes other routes through untouched without following redirects', async () => {
    const t = setup(
      () =>
        new Response(null, {
          status: 307,
          headers: [
            ['location', 'https://web-origin.vercel.app/login?x=1'],
            ['set-cookie', 'a=1'],
            ['set-cookie', 'b=2'],
          ],
        })
    );
    const res = await t.call('/personal/tasks', {
      method: 'POST',
      body: 'payload',
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://tuturuuu.com/login?x=1');
    expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
    expect(res.headers.get('x-gateway-cache')).toBe('BYPASS');
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.method).toBe('POST');
    expect(await sent.text()).toBe('payload');
    expect(t.cache.entries.size).toBe(0);
  });

  it('maps an origin-host returnUrl in the sign-in redirect to the public host', async () => {
    const returnUrl =
      'https://web-origin.vercel.app/verify-token?nextUrl=%2Fpersonal';
    const t = setup(
      () =>
        new Response(null, {
          status: 307,
          headers: {
            location: `https://tuturuuu.com/login?returnUrl=${encodeURIComponent(returnUrl)}`,
          },
        })
    );
    const res = await t.call('/personal');
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnUrl')).toBe(
      'https://tuturuuu.com/verify-token?nextUrl=%2Fpersonal'
    );
  });

  it('maps origin-host query URLs in a relative Location and keeps it relative', async () => {
    const t = setup(
      () =>
        new Response(null, {
          status: 307,
          headers: {
            location:
              '/login?returnUrl=https%3A%2F%2Fweb-origin.vercel.app%2Fx&lang=vi',
          },
        })
    );
    const res = await t.call('/personal');
    const location = res.headers.get('location') ?? '';
    expect(location.startsWith('/login?')).toBe(true);
    const parsed = new URL(location, 'https://tuturuuu.com');
    expect(parsed.searchParams.get('returnUrl')).toBe('https://tuturuuu.com/x');
    expect(parsed.searchParams.get('lang')).toBe('vi');
  });

  it('re-encodes only the rewritten parameter and keeps sibling bytes verbatim', async () => {
    const siblings = 'sig=a%2Fb%2Bc%3D%3D&note=hello%20world&tag=1&tag=2&flag';
    const t = setup(
      () =>
        new Response(null, {
          status: 307,
          headers: {
            location: `https://tuturuuu.com/login?${siblings.split('&').slice(0, 2).join('&')}&returnUrl=https%3A%2F%2Fweb-origin.vercel.app%2Fx%3Fa%3D1&${siblings.split('&').slice(2).join('&')}`,
          },
        })
    );
    const res = await t.call('/personal');
    expect(res.headers.get('location')).toBe(
      'https://tuturuuu.com/login?sig=a%2Fb%2Bc%3D%3D&note=hello%20world&returnUrl=https%3A%2F%2Ftuturuuu.com%2Fx%3Fa%3D1&tag=1&tag=2&flag'
    );
  });

  it('leaves foreign and public-host query URLs untouched', async () => {
    const location =
      'https://tuturuuu.com/login?returnUrl=https%3A%2F%2Ftasks.tuturuuu.com%2Fverify-token';
    const t = setup(
      () => new Response(null, { status: 307, headers: { location } })
    );
    const res = await t.call('/personal');
    expect(res.headers.get('location')).toBe(location);
  });

  it('replaces client X-Forwarded-Host/-Proto with the public host', async () => {
    const t = setup(() => new Response('ok'));
    await t.call('/personal', {
      headers: {
        'x-forwarded-host': 'evil.example.com',
        'x-forwarded-proto': 'http',
      },
    });
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.headers.get('x-forwarded-host')).toBe('tuturuuu.com');
    expect(sent.headers.get('x-forwarded-proto')).toBe('https');
  });

  it('drops client X-Forwarded-Host when no public host is configured', async () => {
    const t = setup(() => new Response('ok'));
    await t.call(
      '/personal',
      { headers: { 'x-forwarded-host': 'evil.example.com' } },
      { WEB_ORIGIN: ENV.WEB_ORIGIN }
    );
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.headers.has('x-forwarded-host')).toBe(false);
  });

  it('GATEWAY_MODE=passthrough skips the cache for public pages too', async () => {
    const t = setup(() => new Response('x'));
    const env = { ...ENV, GATEWAY_MODE: 'passthrough' };
    const a = await t.call('/about', undefined, env);
    await t.call('/about', undefined, env);
    expect(a.headers.get('x-gateway-cache')).toBe('PASSTHROUGH');
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
    expect(t.cache.entries.size).toBe(0);
  });

  it('fails closed without an origin and on loops', async () => {
    const t = setup(() => new Response('x'));
    expect((await t.call('/about', undefined, {})).status).toBe(500);
    expect(
      (await t.call('/about', { headers: { 'x-gateway-hop': '1' } })).status
    ).toBe(508);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the origin is unreachable', async () => {
    const t = setup(() => {
      throw new Error('down');
    });
    expect((await t.call('/about')).status).toBe(502);
    expect((await t.call('/login')).status).toBe(502);
  });

  describe('marketing group flags', () => {
    const FLAGGED: Env = {
      ...ENV,
      MARKETING_ORIGIN: 'https://marketing-origin.example',
      GATEWAY_MARKETING_GROUPS: 'legal, company',
    };
    const hostOf = (input: Request) => new URL(input.url).host;

    it('serves a flagged group from the marketing origin', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      const response = await t.call('/privacy', undefined, FLAGGED);
      expect(await response.text()).toBe('marketing-origin.example');
      const vi = await t.call('/vi/terms', undefined, FLAGGED);
      expect(await vi.text()).toBe('marketing-origin.example');
    });

    it('keeps groups without the flag on the web origin', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      const response = await t.call('/blog', undefined, FLAGGED);
      expect(await response.text()).toBe('web-origin.vercel.app');
      const held = await t.call('/download', undefined, FLAGGED);
      expect(await held.text()).toBe('web-origin.vercel.app');
    });

    it('falls back to web when the flag is on but no marketing origin is set', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      const response = await t.call('/privacy', undefined, {
        ...ENV,
        GATEWAY_MARKETING_GROUPS: 'legal',
      });
      expect(await response.text()).toBe('web-origin.vercel.app');
    });

    it('turning the flag off returns the group to web without a stale cross-origin hit', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      await t.call('/privacy', undefined, FLAGGED);
      const off = await t.call('/privacy', undefined, ENV);
      expect(await off.text()).toBe('web-origin.vercel.app');
    });

    it('keeps signed-in and Next-specific requests on the web origin', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      const cookie = await t.call(
        '/',
        { headers: { cookie: 'sb-abc-auth-token=1' } },
        {
          ...FLAGGED,
          GATEWAY_MARKETING_GROUPS: 'home',
        }
      );
      expect(await cookie.text()).toBe('web-origin.vercel.app');
      const auth = await t.call(
        '/privacy',
        { headers: { authorization: 'Bearer x' } },
        FLAGGED
      );
      expect(await auth.text()).toBe('web-origin.vercel.app');
      const rsc = await t.call('/about', { headers: { rsc: '1' } }, FLAGGED);
      expect(await rsc.text()).toBe('web-origin.vercel.app');
      const anon = await t.call('/about', undefined, FLAGGED);
      expect(await anon.text()).toBe('marketing-origin.example');
    });

    it('rewrites origin hosts in Link headers to the public host', async () => {
      const t = setup(
        () =>
          new Response('page', {
            headers: {
              link: '<https://marketing-origin.example/about>; rel="alternate"; hreflang="en"',
            },
          })
      );
      const response = await t.call('/about', undefined, FLAGGED);
      expect(response.headers.get('link')).toBe(
        '<https://tuturuuu.com/about>; rel="alternate"; hreflang="en"'
      );
    });

    it('serves /assets from the marketing origin and falls back to web when it is not set', async () => {
      const a = setup((r) => new Response(hostOf(r)));
      const withOrigin = await a.call('/assets/app-abc.js', undefined, {
        ...ENV,
        MARKETING_ORIGIN: 'https://marketing-origin.example',
      });
      expect(await withOrigin.text()).toBe('marketing-origin.example');
      // A fresh cache: a stored asset outlives the flag for at most one cache window.
      const b = setup((r) => new Response(hostOf(r)));
      const without = await b.call('/assets/app-abc.js', undefined, ENV);
      expect(await without.text()).toBe('web-origin.vercel.app');
    });
  });
});

describe('bare mount paths', () => {
  function mountEnv(
    paths: string,
    fetch = vi.fn(
      async (request: Request) =>
        new Response(
          `calendar ${new URL(request.url).pathname}${new URL(request.url).search}`
        )
    )
  ) {
    return {
      fetch,
      env: {
        ...ENV,
        GATEWAY_MOUNTED_PATHS: paths,
        MOUNT_CALENDAR: { fetch },
      } as unknown as Env,
    };
  }

  it('hands exactly /<app> with a query to the app binding, untouched', async () => {
    const t = setup(() => new Response('web'));
    const { env, fetch } = mountEnv('/calendar, /tasks');
    const res = await t.call('/calendar?x=1&y=%20z', undefined, env);
    expect(await res.text()).toBe('calendar /calendar?x=1&y=%20z');
    expect(res.headers.get('x-gateway-cache')).toBe('MOUNT');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('keeps unlisted, unbound, nested and lookalike paths on the web origin', async () => {
    const t = setup(() => new Response('web'));
    const { env, fetch } = mountEnv('/calendar,/tasks');
    for (const path of [
      '/tasks?x=1',
      '/calendar/courses',
      '/calendaring',
      '/Calendar',
      '/en/calendar',
    ]) {
      expect(await (await t.call(path, undefined, env)).text()).toBe('web');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores the binding when the path is not listed (rollback)', async () => {
    const t = setup(() => new Response('web'));
    const { env, fetch } = mountEnv('');
    expect(await (await t.call('/calendar?x=1', undefined, env)).text()).toBe(
      'web'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 502 when the mounted app throws', async () => {
    const t = setup(() => new Response('web'));
    const { env } = mountEnv(
      '/calendar',
      vi.fn(async () => {
        throw new Error('down');
      })
    );
    const res = await t.call('/calendar?x=1', undefined, env);
    expect(res.status).toBe(502);
  });
});

describe('explicit Calendar mounts through Worker fetch', () => {
  function fixture(paths = '/calendar,/calendar/*') {
    const binding = vi.fn(
      async (_request: Request) => new Response('calendar')
    );
    const web = vi.fn(async (_request: Request) => new Response('web'));
    vi.stubGlobal('fetch', web);
    vi.stubGlobal('caches', { default: new MemoryCache() });
    const env = {
      ...ENV,
      GATEWAY_MOUNTED_PATHS: paths,
      MOUNT_CALENDAR: { fetch: binding },
    };
    const call = (path: string, init?: RequestInit) =>
      worker.fetch(
        new Request(`https://tuturuuu.com${path}`, init),
        env as unknown as Env,
        { waitUntil: () => undefined }
      );
    return { binding, web, env, call };
  }

  it.each(['/calendar', '/calendar/', '/calendar/events?a=%2F&x=1&x=2+3'])(
    'keeps the complete path and query for %s',
    async (path) => {
      const t = fixture();
      const response = await t.call(path);
      expect(await response.text()).toBe('calendar');
      expect(response.headers.get('x-gateway-cache')).toBe('MOUNT');
      expect(t.binding.mock.calls[0]?.[0].url).toBe(
        `https://tuturuuu.com${path}`
      );
      expect(t.web).not.toHaveBeenCalled();
    }
  );

  it('sanitizes forwarding authority while preserving body, method, auth, cookies and abort', async () => {
    const t = fixture();
    const controller = new AbortController();
    const denied = {
      'X-Forwarded-Host': 'evil.example',
      'X-Forwarded-Proto': 'http',
      'X-Forwarded-For': '192.0.2.1',
      'X-Forwarded-Prefix': '/api',
      'X-Real-IP': '192.0.2.1',
      'X-Original-URL': '/api',
      'X-Original-Host': 'evil.example',
      Forwarded: 'host=evil.example;proto=http',
      'CF-Connecting-IP': '192.0.2.1',
      'CF-Connecting-IPv6': '2001:db8::1',
      'x-tuturuuu-app-base': '/api',
    };
    const request = new Request('https://tuturuuu.com/calendar/events?q=%20', {
      method: 'POST',
      body: 'event=one&event=two',
      signal: controller.signal,
      headers: {
        ...denied,
        authorization: 'Bearer disposable-test',
        cookie: 'tuturuuu_session=disposable; preference=one',
        'content-type': 'application/x-www-form-urlencoded',
        'x-test-header': 'preserved',
      },
    });
    await worker.fetch(request, t.env as unknown as Env, {
      waitUntil: () => undefined,
    });
    const sent = t.binding.mock.calls[0]?.[0];
    expect(sent).not.toBe(request);
    expect(sent?.url).toBe(request.url);
    for (const name of Object.keys(denied)) {
      expect(sent?.headers.has(name)).toBe(false);
      expect(request.headers.has(name)).toBe(true);
    }
    expect(sent?.headers.get('x-gateway-hop')).toBe('1');
    expect(request.headers.has('x-gateway-hop')).toBe(false);
    expect(sent?.method).toBe('POST');
    expect(sent?.headers.get('authorization')).toBe('Bearer disposable-test');
    expect(sent?.headers.get('cookie')).toBe(
      'tuturuuu_session=disposable; preference=one'
    );
    expect(sent?.headers.get('x-test-header')).toBe('preserved');
    expect(sent?.headers.get('content-type')).toBe(
      'application/x-www-form-urlencoded'
    );
    expect(await sent?.text()).toBe('event=one&event=two');
    expect(sent?.bodyUsed).toBe(true);
    expect(sent?.signal.aborted).toBe(false);
    controller.abort();
    expect(sent?.signal.aborted).toBe(true);
    expect(t.web).not.toHaveBeenCalled();
  });

  it('preserves redirects, duplicate cookies and response headers', async () => {
    const t = fixture();
    const headers = new Headers({
      location: '/calendar/login?return=%2Fcalendar',
      'x-app': 'calendar',
    });
    headers.append('set-cookie', 'one=1; Path=/; HttpOnly');
    headers.append('set-cookie', 'two=2; Path=/; Secure');
    t.binding.mockImplementation(
      async () => new Response(null, { status: 307, headers })
    );
    const response = await t.call('/calendar');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      '/calendar/login?return=%2Fcalendar'
    );
    expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get('x-app')).toBe('calendar');
    expect(t.web).not.toHaveBeenCalled();
  });

  it.each([
    '/calendar-evil',
    '/calendars/events',
    '/Calendar',
    '/calendar%2Fevents',
    '/en/calendar',
    '/api/v1/calendar',
    '/auth/callback?code=disposable',
    '/login',
    '/unknown',
    '/',
    '/roadmap',
    '/roadmap/items',
  ])('preserves Web precedence outside the mount: %s', async (path) => {
    const t = fixture();
    expect(await (await t.call(path)).text()).toBe('web');
    expect(t.binding).not.toHaveBeenCalled();
    expect(t.web).toHaveBeenCalledTimes(1);
  });

  it.each(['', '/calendar-evil/*', '/calendar/**', '/*', '/Calendar/*'])(
    'does not admit Calendar through invalid or absent entries: %s',
    async (paths) => {
      const t = fixture(paths);
      expect(await (await t.call('/calendar/events')).text()).toBe('web');
      expect(t.binding).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['/api/x', 'MOUNT_API'],
    ['/auth/callback', 'MOUNT_AUTH'],
    ['/login', 'MOUNT_LOGIN'],
    ['/oauth/callback', 'MOUNT_OAUTH'],
    ['/_next/static/app.js', 'MOUNT__NEXT'],
    ['/learn/courses', 'MOUNT_LEARN'],
  ])('rejects runtime-only mount authority for %s', async (path, name) => {
    const segment = `/${path.split('/')[1]}`;
    const t = fixture(`${segment},${segment}/*`);
    const forbidden = vi.fn(
      async (_request: Request) => new Response('forbidden')
    );
    const env = { ...t.env, [name]: { fetch: forbidden } };
    const response = await worker.fetch(
      new Request(`https://tuturuuu.com${path}`),
      env as unknown as Env,
      { waitUntil: () => undefined }
    );
    expect(await response.text()).toBe('web');
    expect(forbidden).not.toHaveBeenCalled();
    expect(t.binding).not.toHaveBeenCalled();
    expect(t.web).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/calendar/../api/x', '/api/x'],
    ['/%63alendar/x', '/%63alendar/x'],
    ['//calendar/x', '//calendar/x'],
    ['/Calendar/x', '/Calendar/x'],
    ['/calendar%2F..%2Fapi', '/calendar%2F..%2Fapi'],
    [String.raw`/calendar\..\api`, '/api'],
    ['/calendarx/y', '/calendarx/y'],
  ])('never mounts hostile target %s', async (target, normalizedPath) => {
    const t = fixture();
    const request = new Request(`https://tuturuuu.com${target}`);
    expect(new URL(request.url).pathname).toBe(normalizedPath);
    const response = await worker.fetch(request, t.env as unknown as Env, {
      waitUntil: () => undefined,
    });
    expect(await response.text()).toBe('web');
    expect(t.binding).not.toHaveBeenCalled();
    expect(t.web).toHaveBeenCalledTimes(1);
  });

  it('keeps bare and subtree admission independent', async () => {
    const t = fixture('/calendar/*');
    expect(await (await t.call('/calendar')).text()).toBe('web');
    expect(await (await t.call('/calendar/events')).text()).toBe('calendar');
  });

  it('does not mount on a foreign host', async () => {
    const t = fixture();
    const response = await worker.fetch(
      new Request('https://evil.example/calendar'),
      t.env as unknown as Env,
      { waitUntil: () => undefined }
    );
    expect(await response.text()).toBe('web');
    expect(t.binding).not.toHaveBeenCalled();
  });

  it('keeps unbound admitted paths on Web', async () => {
    const t = fixture();
    const response = await worker.fetch(
      new Request('https://tuturuuu.com/calendar/events'),
      { ...ENV, GATEWAY_MOUNTED_PATHS: '/calendar,/calendar/*' },
      { waitUntil: () => undefined }
    );
    expect(await response.text()).toBe('web');
    expect(t.binding).not.toHaveBeenCalled();
  });

  it('returns 502 without an auth fallback or retry when the app fails', async () => {
    const t = fixture();
    t.binding.mockRejectedValue(new Error('disposable failure'));
    const response = await t.call('/calendar', {
      headers: { cookie: 'session=disposable' },
    });
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(t.binding).toHaveBeenCalledTimes(1);
    expect(t.web).not.toHaveBeenCalled();
  });

  it('retains the loop fence ahead of mount dispatch', async () => {
    const t = fixture();
    expect(
      (await t.call('/calendar', { headers: { 'x-gateway-hop': '1' } })).status
    ).toBe(508);
    expect(t.binding).not.toHaveBeenCalled();
    expect(t.web).not.toHaveBeenCalled();
  });
});
