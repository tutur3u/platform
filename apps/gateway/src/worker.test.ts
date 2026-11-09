import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifest } from './manifest';
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
      const rsc = await t.call(
        '/about',
        { headers: { rsc: '1' } },
        FLAGGED
      );
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
      const t = setup((r) => new Response(hostOf(r)));
      const withOrigin = await t.call('/assets/app-abc.js', undefined, {
        ...ENV,
        MARKETING_ORIGIN: 'https://marketing-origin.example',
      });
      expect(await withOrigin.text()).toBe('marketing-origin.example');
      const without = await t.call('/assets/app-abc.js', undefined, ENV);
      expect(await without.text()).toBe('web-origin.vercel.app');
    });
  });
});
