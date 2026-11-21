import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifest } from './manifest';
import { withWebRest } from './web-rest.test-helper';
import { type CacheLike, createHandler, type Env } from './worker';

class MemoryCache implements CacheLike {
  entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

const MARKETING = 'https://marketing-origin.example';

/** Every Marketing group flagged; Web paths reach the web-rest family. */
const ENV: Env = {
  PUBLIC_HOST: 'tuturuuu.com',
  MARKETING_ORIGIN: MARKETING,
  GATEWAY_MARKETING_GROUPS: 'legal,company,products,solutions,blog,home',
  ...withWebRest(),
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
  it('redirects /mastermind to its host only when enabled', async () => {
    const t = setup(() => new Response('web'));
    const enabled = { ...ENV, GATEWAY_MASTERMIND_REDIRECT: '1' };
    const response = await t.call('/mastermind/vi?x=1', undefined, enabled);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://mastermind.tuturuuu.com/vi?x=1'
    );
    expect(t.fetchMock).not.toHaveBeenCalled();
    const off = await t.call('/mastermind/vi');
    expect(off.headers.get('Location')).not.toBe(
      'https://mastermind.tuturuuu.com/vi'
    );
  });

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
      'https://marketing-origin.example/about'
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

  it('sends auth cookies and Authorization to web-rest uncached, keeping them intact', async () => {
    const t = setup(() => new Response('private'));
    const withCookie = await t.call('/about', {
      headers: { cookie: 'sb-x-auth-token=1' },
    });
    expect(withCookie.headers.get('x-gateway-cache')).toBe('FAMILY');
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.headers.get('cookie')).toBe('sb-x-auth-token=1');
    await t.call('/about', { headers: { authorization: 'Bearer t' } });
    const authorized = t.fetchMock.mock.calls[1]?.[0] as Request;
    expect(authorized.headers.get('authorization')).toBe('Bearer t');
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
            ['location', 'https://marketing-origin.example/login?x=1'],
            ['set-cookie', 'a=1'],
            ['set-cookie', 'b=2'],
          ],
        })
    );
    const res = await t.call('/about', {
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
      'https://marketing-origin.example/verify-token?nextUrl=%2Fpersonal';
    const t = setup(
      () =>
        new Response(null, {
          status: 307,
          headers: {
            location: `https://tuturuuu.com/login?returnUrl=${encodeURIComponent(returnUrl)}`,
          },
        })
    );
    const res = await t.call('/about');
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
              '/login?returnUrl=https%3A%2F%2Fmarketing-origin.example%2Fx&lang=vi',
          },
        })
    );
    const res = await t.call('/about');
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
            location: `https://tuturuuu.com/login?${siblings.split('&').slice(0, 2).join('&')}&returnUrl=https%3A%2F%2Fmarketing-origin.example%2Fx%3Fa%3D1&${siblings.split('&').slice(2).join('&')}`,
          },
        })
    );
    const res = await t.call('/about');
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
    const res = await t.call('/about');
    expect(res.headers.get('location')).toBe(location);
  });

  it('replaces client X-Forwarded-Host/-Proto with the public host', async () => {
    const t = setup(() => new Response('ok'));
    await t.call('/about', {
      headers: {
        'x-forwarded-host': 'evil.example.com',
        'x-forwarded-proto': 'http',
      },
    });
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.headers.get('x-forwarded-host')).toBe('tuturuuu.com');
    expect(sent.headers.get('x-forwarded-proto')).toBe('https');
  });

  it('never forwards client x-vercel-* headers to the Marketing origin', async () => {
    const t = setup(() => new Response('ok'));
    await t.call('/about', {
      headers: {
        'x-vercel-forwarded-for': '198.51.100.4',
        'x-vercel-protection-bypass': 'forged',
      },
    });
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(new URL(sent.url).host).toBe('marketing-origin.example');
    expect(sent.headers.has('x-vercel-forwarded-for')).toBe(false);
    expect(sent.headers.has('x-vercel-protection-bypass')).toBe(false);
  });

  it('drops client X-Forwarded-Host when no public host is configured', async () => {
    const t = setup(() => new Response('ok'));
    await t.call(
      '/about',
      { headers: { 'x-forwarded-host': 'evil.example.com' } },
      { MARKETING_ORIGIN: MARKETING, GATEWAY_MARKETING_GROUPS: 'company' }
    );
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.headers.has('x-forwarded-host')).toBe(false);
  });

  it('fails closed without the web-rest binding and on loops', async () => {
    const t = setup(() => new Response('x'));
    const unbound = await t.call('/personal', undefined, {
      PUBLIC_HOST: 'tuturuuu.com',
    });
    expect(unbound.status).toBe(503);
    expect(await unbound.text()).toBe('gateway web family unavailable');
    expect((await t.call('/about', undefined, {})).status).toBe(503);
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
    expect((await t.call('/about', { method: 'POST' })).status).toBe(502);
    // A throwing family answers 502 too.
    expect((await t.call('/login')).status).toBe(502);
  });

  describe('asset body integrity', () => {
    const png = (body: BodyInit | null, headers: Record<string, string> = {}) =>
      new Response(body, {
        headers: { 'content-type': 'image/png', ...headers },
      });

    it('never stores or lets the edge keep an empty 200 asset', async () => {
      const t = setup(() => png(null));
      const first = await t.call('/assets/logo.png');
      expect(first.headers.get('x-gateway-cache')).toBe('BYPASS');
      expect(first.headers.get('x-gateway-bypass')).toBe('empty-body');
      expect(first.headers.get('cache-control')).toBe('no-store');
      expect(t.cache.entries.size).toBe(0);
    });

    it('never stores a 200 whose content-length is zero', async () => {
      const t = setup(() => png('', { 'content-length': '0' }));
      const first = await t.call('/assets/logo.png');
      expect(first.headers.get('x-gateway-bypass')).toBe('empty-body');
      expect(t.cache.entries.size).toBe(0);
    });

    it('never stores an asset shorter than the declared length', async () => {
      const t = setup(() => png('abc', { 'content-length': '2572' }));
      const first = await t.call('/assets/logo.png');
      expect(first.headers.get('x-gateway-bypass')).toBe('truncated-body');
      expect(first.headers.get('cache-control')).toBe('no-store');
      expect(await first.text()).toBe('abc');
      expect(t.cache.entries.size).toBe(0);
    });

    it('does not refresh a stale entry with an empty body', async () => {
      let broken = false;
      const t = setup(() =>
        broken ? png(null) : png('PNGDATA', { 'content-length': '7' })
      );
      await t.call('/assets/logo.png');
      expect(t.cache.entries.size).toBe(1);
      t.advance(600);
      broken = true;
      const stale = await t.call('/assets/logo.png');
      expect(stale.headers.get('x-gateway-cache')).toBe('STALE');
      expect(await stale.text()).toBe('PNGDATA');
      const next = await t.call('/assets/logo.png');
      expect(await next.text()).toBe('PNGDATA');
    });

    it('still stores a complete asset and serves it from the cache', async () => {
      const t = setup(() => png('PNGDATA', { 'content-length': '7' }));
      const first = await t.call('/assets/logo.png');
      expect(first.headers.get('x-gateway-cache')).toBe('MISS');
      expect(await first.text()).toBe('PNGDATA');
      const second = await t.call('/assets/logo.png');
      expect(second.headers.get('x-gateway-cache')).toBe('HIT');
      expect(await second.text()).toBe('PNGDATA');
      expect(t.fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stores a streamed asset with no declared length when it has bytes', async () => {
      const t = setup(() => png(new Blob(['PNGDATA']).stream()));
      const first = await t.call('/assets/logo.png');
      expect(first.headers.get('x-gateway-cache')).toBe('MISS');
      expect(await first.text()).toBe('PNGDATA');
      expect(t.cache.entries.size).toBe(1);
    });
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

    it('keeps groups without the flag on the web-rest family', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      const response = await t.call('/blog', undefined, FLAGGED);
      expect(await response.text()).toBe('tuturuuu.com');
      const held = await t.call('/download', undefined, FLAGGED);
      expect(await held.text()).toBe('tuturuuu.com');
    });

    it('falls back to web when the flag is on but no marketing origin is set', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      const response = await t.call('/privacy', undefined, {
        ...ENV,
        MARKETING_ORIGIN: undefined,
        GATEWAY_MARKETING_GROUPS: 'legal',
      });
      expect(response.headers.get('x-gateway-family')).toBe('web-rest');
      expect(await response.text()).toBe('tuturuuu.com');
    });

    it('turning the flag off returns the group to web without a stale cross-origin hit', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      await t.call('/privacy', undefined, FLAGGED);
      const off = await t.call('/privacy', undefined, {
        ...ENV,
        GATEWAY_MARKETING_GROUPS: '',
      });
      expect(await off.text()).toBe('tuturuuu.com');
    });

    it('keeps signed-in and Next-specific requests on the web families', async () => {
      const t = setup((r) => new Response(hostOf(r)));
      const cookie = await t.call(
        '/',
        { headers: { cookie: 'sb-abc-auth-token=1' } },
        {
          ...FLAGGED,
          GATEWAY_MARKETING_GROUPS: 'home',
        }
      );
      expect(await cookie.text()).toBe('tuturuuu.com');
      const auth = await t.call(
        '/privacy',
        { headers: { authorization: 'Bearer x' } },
        FLAGGED
      );
      expect(await auth.text()).toBe('tuturuuu.com');
      const rsc = await t.call('/about', { headers: { rsc: '1' } }, FLAGGED);
      expect(await rsc.text()).toBe('tuturuuu.com');
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

    it('serves /assets from the marketing origin and falls back to web-rest when it is not set', async () => {
      const a = setup((r) => new Response(hostOf(r)));
      const withOrigin = await a.call('/assets/app-abc.js', undefined, {
        ...ENV,
        MARKETING_ORIGIN: 'https://marketing-origin.example',
      });
      expect(await withOrigin.text()).toBe('marketing-origin.example');
      // A fresh cache: a stored asset outlives the flag for at most one cache window.
      const b = setup((r) => new Response(hostOf(r)));
      const without = await b.call('/assets/app-abc.js', undefined, {
        ...ENV,
        MARKETING_ORIGIN: undefined,
      });
      expect(await without.text()).toBe('tuturuuu.com');
    });
  });
});

describe('web-rest fallback without an HTTP origin', () => {
  it('serves an unmatched path from web-rest while no family is flagged', async () => {
    const t = setup((r) => new Response(new URL(r.url).host));
    for (const env of [ENV, { ...ENV, GATEWAY_WEB_FAMILIES: '' }]) {
      const res = await t.call('/personal/tasks?x=1', undefined, env);
      expect(await res.text()).toBe('tuturuuu.com');
      expect(res.headers.get('x-gateway-cache')).toBe('FAMILY');
      expect(res.headers.get('x-gateway-family')).toBe('web-rest');
    }
    const sent = t.fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.url).toBe('https://tuturuuu.com/personal/tasks?x=1');
  });

  it('answers 503 without the binding and never fetches an origin', async () => {
    const t = setup(() => new Response('origin'));
    const { WEB_FAMILY_WEB_REST: _unbound, ...env } = ENV;
    for (const path of ['/personal/tasks', '/login', '/media/a.png']) {
      const res = await t.call(path, undefined, env);
      expect(res.status).toBe(503);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('ignores GATEWAY_MODE=passthrough and a deprecated WEB_ORIGIN', async () => {
    const t = setup((r) => new Response(new URL(r.url).host));
    const env: Env = {
      ...ENV,
      GATEWAY_MODE: 'passthrough',
      WEB_ORIGIN: 'https://origin.tuturuuu.com',
    };
    const res = await t.call('/personal', undefined, env);
    expect(res.headers.get('x-gateway-family')).toBe('web-rest');
    const page = await t.call('/about', undefined, env);
    expect(await page.text()).toBe('marketing-origin.example');
    expect(page.headers.get('x-gateway-cache')).toBe('MISS');
    for (const [request] of t.fetchMock.mock.calls) {
      expect(new URL((request as Request).url).host).not.toBe(
        'origin.tuturuuu.com'
      );
    }
    const { WEB_FAMILY_WEB_REST: _unbound, ...unbound } = env;
    expect((await t.call('/personal', undefined, unbound)).status).toBe(503);
  });
});

describe('bare mount paths', () => {
  function mountEnv(
    paths: string,
    fetch = vi.fn(
      async (request: Request) =>
        new Response(
          `learn ${new URL(request.url).pathname}${new URL(request.url).search}`
        )
    )
  ) {
    return {
      fetch,
      env: {
        ...ENV,
        GATEWAY_MOUNTED_PATHS: paths,
        MOUNT_LEARN: { fetch },
      } as unknown as Env,
    };
  }

  it('hands exactly /<app> with a query to the app binding, untouched', async () => {
    const t = setup(() => new Response('web'));
    const { env, fetch } = mountEnv('/learn, /tasks');
    const res = await t.call('/learn?x=1&y=%20z', undefined, env);
    expect(await res.text()).toBe('learn /learn?x=1&y=%20z');
    expect(res.headers.get('x-gateway-cache')).toBe('MOUNT');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('keeps unlisted, unbound, nested and lookalike paths on web-rest', async () => {
    const t = setup(() => new Response('web'));
    const { env, fetch } = mountEnv('/learn,/tasks');
    for (const path of [
      '/tasks?x=1',
      '/learn/courses',
      '/learning',
      '/Learn',
      '/en/learn',
    ]) {
      expect(await (await t.call(path, undefined, env)).text()).toBe('web');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores the binding when the path is not listed (rollback)', async () => {
    const t = setup(() => new Response('web'));
    const { env, fetch } = mountEnv('');
    expect(await (await t.call('/learn?x=1', undefined, env)).text()).toBe(
      'web'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 502 when the mounted app throws', async () => {
    const t = setup(() => new Response('web'));
    const { env } = mountEnv(
      '/learn',
      vi.fn(async () => {
        throw new Error('down');
      })
    );
    const res = await t.call('/learn?x=1', undefined, env);
    expect(res.status).toBe(502);
  });
});
