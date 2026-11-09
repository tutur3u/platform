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
  const handle = createHandler({ cache: () => cache, now: () => now, manifest });
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
    expect(t.fetchMock.mock.calls[0]?.[0].url).toBe('https://web-origin.vercel.app/about');
  });

  it('answers HEAD from the GET entry', async () => {
    const t = setup(() => new Response('body'));
    await t.call('/about');
    const head = await t.call('/about', { method: 'HEAD' });
    expect(head.headers.get('x-gateway-cache')).toBe('HIT');
    expect(await head.text()).toBe('');
  });

  it('never stores a response carrying Set-Cookie', async () => {
    const t = setup(() => new Response('x', { headers: { 'set-cookie': 'a=1; Path=/' } }));
    const first = await t.call('/about');
    expect(first.headers.get('x-gateway-cache')).toBe('BYPASS');
    expect(first.headers.get('set-cookie')).toBe('a=1; Path=/');
    expect(t.cache.entries.size).toBe(0);
  });

  it('bypasses cache for auth cookies and Authorization, keeping them intact', async () => {
    const t = setup(() => new Response('private'));
    const withCookie = await t.call('/about', { headers: { cookie: 'sb-x-auth-token=1' } });
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
    const res = await t.call('/personal/tasks', { method: 'POST', body: 'payload' });
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
    expect((await t.call('/about', { headers: { 'x-gateway-hop': '1' } })).status).toBe(508);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the origin is unreachable', async () => {
    const t = setup(() => {
      throw new Error('down');
    });
    expect((await t.call('/about')).status).toBe(502);
    expect((await t.call('/login')).status).toBe(502);
  });
});
