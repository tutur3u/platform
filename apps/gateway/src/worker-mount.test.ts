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

function mountEnv(
  paths: string,
  fetch = vi.fn(async (_request: Request) => new Response('mounted'))
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

function handler(cache = new MemoryCache()) {
  return {
    cache,
    handle: createHandler({ cache: () => cache, now: () => 0, manifest }),
  };
}

afterEach(() => vi.unstubAllGlobals());

const FORBIDDEN = [
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-for',
  'x-forwarded-port',
  'forwarded',
  'x-real-ip',
  'x-original-url',
  'x-original-host',
  'x-rewrite-url',
  'x-middleware-subrequest',
  'x-nextjs-data',
  'x-next-intl-locale',
  'x-tuturuuu-app-base',
  'x-gateway-test',
];

describe('mounted app ingress', () => {
  it('keeps the identical clean mount request without forwarding headers', async () => {
    const { cache, handle } = handler();
    const { env, fetch } = mountEnv('/learn');
    const request = new Request('https://tuturuuu.com/learn?q=%20', {
      redirect: 'manual',
      headers: { 'cf-connecting-ip': '192.0.2.1', 'x-keep': 'yes' },
    });
    await handle(request, env);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(request);
    expect(request.headers.has('x-forwarded-host')).toBe(false);
    expect(request.headers.has('x-forwarded-proto')).toBe(false);
    expect(cache.entries.size).toBe(0);
  });

  it.each([32, 1_300_000])(
    'strips spoofed mount headers and preserves a %i-byte stream',
    async (size) => {
      const { cache, handle } = handler();
      const headers = new Headers(
        FORBIDDEN.map((name, index) => [
          index % 2 ? name.toUpperCase() : name,
          'untrusted',
        ])
      );
      headers.set('cf-connecting-ip', '192.0.2.1');
      headers.set('authorization', 'Bearer fixture-only');
      headers.set('cookie', 'fixture_session=1');
      headers.set('x-keep', 'yes');
      const bytes = new Uint8Array(size).map((_, index) => index % 251);
      const init: RequestInit & { duplex: 'half' } = {
        method: 'POST',
        headers,
        redirect: 'manual',
        duplex: 'half',
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 17));
            controller.enqueue(bytes.subarray(17));
            controller.close();
          },
        }),
      };
      const request = new Request('https://tuturuuu.com/learn?q=%20&x=1', init);
      const { env, fetch } = mountEnv(
        '/learn',
        vi.fn(async (incoming: Request) => {
          expect(incoming).not.toBe(request);
          expect(incoming.url).toBe(request.url);
          expect(incoming.method).toBe(request.method);
          expect(incoming.redirect).toBe('manual');
          for (const name of FORBIDDEN) {
            expect(incoming.headers.has(name)).toBe(false);
          }
          expect(incoming.headers.get('cf-connecting-ip')).toBe('192.0.2.1');
          expect(incoming.headers.get('authorization')).toBe(
            'Bearer fixture-only'
          );
          expect(incoming.headers.get('cookie')).toBe('fixture_session=1');
          expect(incoming.headers.get('x-keep')).toBe('yes');
          const received = new Uint8Array(await incoming.arrayBuffer());
          expect(received.byteLength).toBe(bytes.byteLength);
          expect(received.every((byte, index) => byte === bytes[index])).toBe(
            true
          );
          return new Response(null, {
            status: 307,
            headers: [
              ['location', 'https://tuturuuu.com/learn/login?next=%2Flearn'],
              ['set-cookie', 'fixture_a=1; Path=/learn'],
              ['set-cookie', 'fixture_b=2; Path=/learn'],
              ['cache-control', 'private, no-store'],
              ['content-security-policy', "default-src 'none'"],
            ],
          });
        })
      );
      const response = await handle(request, env);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(307);
      expect(response.headers.get('x-gateway-cache')).toBe('MOUNT');
      expect(response.headers.get('location')).toBe(
        'https://tuturuuu.com/learn/login?next=%2Flearn'
      );
      expect(response.headers.getSetCookie()).toEqual([
        'fixture_a=1; Path=/learn',
        'fixture_b=2; Path=/learn',
      ]);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'none'"
      );
      expect(cache.entries.size).toBe(0);
    }
  );

  it('keeps refusing a request that carries the gateway hop header', async () => {
    const { handle } = handler();
    const { env, fetch } = mountEnv('/learn');
    const response = await handle(
      new Request('https://tuturuuu.com/learn?x=1', {
        headers: { 'X-Gateway-Hop': '1' },
      }),
      env
    );
    expect(response.status).toBe(508);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps unmounted paths on the existing origin forwarding contract', async () => {
    const origin = vi.fn(async (_request: Request) => new Response('web'));
    vi.stubGlobal('fetch', origin);
    const { handle } = handler();
    const { env, fetch } = mountEnv('/learn');
    await handle(
      new Request('https://tuturuuu.com/learn/courses', {
        headers: {
          'x-forwarded-host': 'evil.example.com',
          'x-forwarded-proto': 'http',
        },
      }),
      env
    );
    expect(fetch).not.toHaveBeenCalled();
    const sent = origin.mock.calls[0]?.[0];
    expect(sent?.headers.get('x-forwarded-host')).toBe('tuturuuu.com');
    expect(sent?.headers.get('x-forwarded-proto')).toBe('https');
  });
});

describe('mount admission', () => {
  function mindEnv(paths: string, extra: Partial<Env> = {}) {
    const fetch = vi.fn(async (request: Request) => new Response(request.url));
    const origin = vi.fn(async (_request: Request) => new Response('web'));
    vi.stubGlobal('fetch', origin);
    return {
      fetch,
      origin,
      env: {
        ...ENV,
        ...extra,
        GATEWAY_MOUNTED_PATHS: paths,
        MOUNT_MIND: { fetch },
        MOUNT_API: { fetch },
      } as unknown as Env,
    };
  }

  it('routes the exact segment and an explicit subtree without rewriting', async () => {
    const { cache, handle } = handler();
    const { env, fetch, origin } = mindEnv('/mind, /mind/*');
    for (const path of ['/mind', '/mind?q', '/mind/', '/mind/a/b?x=%20&x=1']) {
      const response = await handle(
        new Request(`https://tuturuuu.com${path}`),
        env
      );
      expect(await response.text()).toBe(`https://tuturuuu.com${path}`);
      expect(response.headers.get('x-gateway-cache')).toBe('MOUNT');
    }
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(origin).not.toHaveBeenCalled();
    expect(cache.entries.size).toBe(0);
  });

  it('admits nested paths only through an explicit subtree entry', async () => {
    const { handle } = handler();
    const exact = mindEnv('/mind');
    await handle(new Request('https://tuturuuu.com/mind/boards'), exact.env);
    await handle(new Request('https://tuturuuu.com/mind/'), exact.env);
    expect(exact.fetch).not.toHaveBeenCalled();
    expect(exact.origin).toHaveBeenCalledTimes(2);
    const subtree = mindEnv('/mind/*');
    await handle(new Request('https://tuturuuu.com/mind?x=1'), subtree.env);
    expect(subtree.fetch).not.toHaveBeenCalled();
    await handle(new Request('https://tuturuuu.com/mind/boards'), subtree.env);
    expect(subtree.fetch).toHaveBeenCalledTimes(1);
  });

  it('mounts nothing when the public host is not configured', async () => {
    const { handle } = handler();
    const { env, fetch, origin } = mindEnv('/mind,/mind/*', {
      PUBLIC_HOST: undefined,
    });
    for (const path of ['/mind', '/mind/boards?x=1']) {
      await handle(new Request(`https://tuturuuu.com${path}`), env);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(origin).toHaveBeenCalledTimes(2);
  });

  it('does not mount encoded, normalized, lookalike, API or alias-host paths', async () => {
    const { handle } = handler();
    const { env, fetch } = mindEnv('/mind,/mind/*,/api,/api/*');
    for (const path of [
      '/mindful',
      '/mind-x',
      '/MIND',
      '/mind%2Fx',
      '/%6Dind',
      '//mind',
      '/api',
      '/api/mind',
      '/mind/../x',
      '/mind%5Cx',
      '/mind%2Ex',
      '/en/mind',
    ]) {
      await handle(new Request(`https://tuturuuu.com${path}`), env);
    }
    for (const host of ['evil.example.com', 'www.tuturuuu.com']) {
      await handle(new Request(`https://${host}/mind/boards`), env);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sanitizes nested mounted requests and passes responses through', async () => {
    const { cache, handle } = handler();
    const { env, origin } = mindEnv('/mind/*');
    const fetch = vi.fn(async (received: Request) => {
      for (const name of FORBIDDEN) {
        expect(received.headers.has(name)).toBe(false);
      }
      expect(received.url).toBe('https://tuturuuu.com/mind/api/boards?x=1');
      expect(received.method).toBe('POST');
      expect(await received.text()).toBe('unchanged-body');
      return new Response(null, {
        status: 307,
        headers: [
          ['location', 'https://tuturuuu.com/mind/login?next=%2Fmind'],
          ['set-cookie', 'mind_first=a; Path=/mind; Secure; HttpOnly'],
          ['set-cookie', 'mind_second=b; Path=/mind; Secure; HttpOnly'],
          ['cache-control', 'private, no-store'],
        ],
      });
    });
    const response = await handle(
      new Request('https://tuturuuu.com/mind/api/boards?x=1', {
        method: 'POST',
        body: 'unchanged-body',
        headers: FORBIDDEN.map((name) => [name, 'untrusted']),
      }),
      { ...env, MOUNT_MIND: { fetch } } as unknown as Env
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/mind/login?next=%2Fmind'
    );
    expect(response.headers.getSetCookie()).toEqual([
      'mind_first=a; Path=/mind; Secure; HttpOnly',
      'mind_second=b; Path=/mind; Secure; HttpOnly',
    ]);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(origin).not.toHaveBeenCalled();
    expect(cache.entries.size).toBe(0);
  });
});
