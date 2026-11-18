import { describe, expect, it, vi } from 'vitest';
import {
  anonymousPagePolicy,
  DEGRADED_RENDER_MARKER,
  EDGE_CACHE_HEADER,
  type EdgePageCacheOptions,
  type EdgePageCacheStore,
  resolveRequestLocale,
  serveWithEdgePageCache,
} from './edge-page-cache';

const SHA = 'c'.repeat(40);
const locales = ['en', 'vi'] as const;
const origin = 'https://git.tuturuuu.com';

function memoryStore() {
  const entries = new Map<string, Response>();
  const store: EdgePageCacheStore = {
    match: async (request) => entries.get(request.url)?.clone(),
    put: async (request, response) => {
      entries.set(request.url, response);
    },
  };
  return { entries, store };
}

function options(
  store: EdgePageCacheStore,
  extra: Partial<EdgePageCacheOptions> = {}
): EdgePageCacheOptions {
  return { defaultLocale: 'en', locales, store, ...extra };
}

function page(
  path: string,
  headers: Record<string, string> = {},
  method = 'GET'
) {
  return new Request(`${origin}${path}`, { headers, method });
}

function html(body = '<main>file</main>', init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'private, no-store');
  }
  return new Response(body, { ...init, headers });
}

describe('resolveRequestLocale', () => {
  it('picks the highest weighted supported language', () => {
    expect(
      resolveRequestLocale('fr;q=0.9, vi;q=0.8, en;q=0.1', locales, 'en')
    ).toBe('vi');
    expect(resolveRequestLocale('vi-VN,en;q=0.5', locales, 'en')).toBe('vi');
  });

  it('falls back to the default locale', () => {
    expect(resolveRequestLocale(null, locales, 'en')).toBe('en');
    expect(resolveRequestLocale('*', locales, 'en')).toBe('en');
    expect(resolveRequestLocale('de, fr', locales, 'en')).toBe('en');
    expect(resolveRequestLocale('vi;q=0', locales, 'en')).toBe('en');
  });
});

describe('anonymousPagePolicy', () => {
  const policy = (request: Request) =>
    anonymousPagePolicy(request, options({} as never));

  it('admits repository, blob and tree pages', () => {
    expect(policy(page('/tutur3u/platform'))).not.toBeNull();
    expect(
      policy(page('/tutur3u/platform/blob/main/turbo.json'))
    ).not.toBeNull();
    expect(policy(page('/tutur3u/platform/tree/main/apps'))).not.toBeNull();
    expect(policy(page('/tutur3u/platform', {}, 'HEAD'))).not.toBeNull();
  });

  it.each([
    '/',
    '/robots.txt',
    '/-/personal/repositories',
    '/api/build-info',
    '/login',
    '/assets/app.js',
    '/en/tutur3u/platform',
    '/tutur3u/platform/issues',
    '/tutur3u/platform/blob',
    '/tutur3u/platform/blob/main/x?ref=dev',
    '/.well-known/x',
  ])('rejects %s', (path) => {
    expect(policy(page(path))).toBeNull();
  });

  it('rejects unsafe methods', () => {
    expect(policy(page('/tutur3u/platform', {}, 'POST'))).toBeNull();
  });

  it.each([
    ['cookie', 'NEXT_LOCALE=vi'],
    ['cookie', 'sb-access-token=secret'],
    ['authorization', 'Bearer token'],
    ['proxy-authorization', 'Basic x'],
  ])('rejects a request with %s', (name, value) => {
    expect(policy(page('/tutur3u/platform', { [name]: value }))).toBeNull();
  });

  it('splits keys by locale and path and flags commit SHAs', () => {
    const en = policy(page('/tutur3u/platform/blob/main/a'));
    const vi = policy(
      page('/tutur3u/platform/blob/main/a', { 'accept-language': 'vi' })
    );
    const other = policy(page('/tutur3u/platform/blob/main/b'));
    expect(new Set([en?.key.url, vi?.key.url, other?.key.url]).size).toBe(3);
    expect(vi?.locale).toBe('vi');
    expect(en?.immutable).toBe(false);
    expect(policy(page(`/tutur3u/platform/blob/${SHA}/a`))?.immutable).toBe(
      true
    );
  });
});

describe('serveWithEdgePageCache', () => {
  it('misses, stores a public cookie-free copy, then hits', async () => {
    const { entries, store } = memoryStore();
    const render = vi.fn(async () =>
      html('<main>file</main>', {
        headers: { 'set-cookie': 'NEXT_LOCALE=en; Path=/; Secure' },
      })
    );
    const call = () =>
      serveWithEdgePageCache({
        options: options(store),
        render,
        request: page('/tutur3u/platform/blob/main/turbo.json'),
      });

    const miss = await call();
    expect(miss.headers.get(EDGE_CACHE_HEADER)).toBe('MISS');
    expect(miss.headers.get('cache-control')).toBe('private, no-store');
    expect(miss.headers.get('set-cookie')).toContain('NEXT_LOCALE');

    const hit = await call();
    expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe('HIT');
    expect(await hit.text()).toBe('<main>file</main>');
    expect(hit.headers.get('set-cookie')).toBeNull();
    expect(hit.headers.get('cache-control')).toContain('public');
    expect(hit.headers.get('cdn-cache-control')).toBe('public, max-age=300');
    expect(render).toHaveBeenCalledTimes(1);
    expect(entries.size).toBe(1);
  });

  it('answers HEAD from the cache without a body and never writes from it', async () => {
    const { entries, store } = memoryStore();
    const render = vi.fn(async () => html());
    const run = (method: string) =>
      serveWithEdgePageCache({
        options: options(store),
        render,
        request: page('/tutur3u/platform', {}, method),
      });

    await run('HEAD');
    expect(entries.size).toBe(0);
    await run('GET');
    const head = await run('HEAD');
    expect(head.headers.get(EDGE_CACHE_HEADER)).toBe('HIT');
    expect(await head.text()).toBe('');
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('applies branch, commit and not-found TTLs', async () => {
    const { store } = memoryStore();
    let clock = 0;
    const renders: Record<string, number> = {};
    const run = (path: string, status = 200) =>
      serveWithEdgePageCache({
        options: options(store, { now: () => clock }),
        render: async () => {
          renders[path] = (renders[path] ?? 0) + 1;
          return html('<main>x</main>', { status });
        },
        request: page(path),
      });

    const branch = '/tutur3u/platform/blob/main/a';
    const pinned = `/tutur3u/platform/blob/${SHA}/a`;
    const missing = '/tutur3u/platform/blob/main/missing';
    await Promise.all([run(branch), run(pinned), run(missing, 404)]);

    clock = 61_000;
    await Promise.all([run(branch), run(pinned), run(missing, 404)]);
    expect(renders).toEqual({ [branch]: 1, [pinned]: 1, [missing]: 2 });

    clock = 301_000;
    await Promise.all([run(branch), run(pinned)]);
    expect(renders[branch]).toBe(2);
    expect(renders[pinned]).toBe(1);

    clock = 86_401_000;
    await run(pinned);
    expect(renders[pinned]).toBe(2);
  });

  it.each([500, 502, 503, 429, 302])(
    'never stores a %i response',
    async (status) => {
      const { entries, store } = memoryStore();
      const response = await serveWithEdgePageCache({
        options: options(store),
        render: async () => html('<main>x</main>', { status }),
        request: page('/tutur3u/platform'),
      });
      expect(response.status).toBe(status);
      expect(response.headers.get(EDGE_CACHE_HEADER)).toBe('BYPASS');
      expect(entries.size).toBe(0);
    }
  );

  it('never stores a degraded render, a non-HTML response or an auth cookie', async () => {
    const { entries, store } = memoryStore();
    const run = (response: Response) =>
      serveWithEdgePageCache({
        options: options(store),
        render: async () => response,
        request: page('/tutur3u/platform'),
      });

    await run(html(`<main ${DEGRADED_RENDER_MARKER}="true">rate limit</main>`));
    await run(
      new Response('{}', { headers: { 'content-type': 'application/json' } })
    );
    await run(
      html('<main>x</main>', {
        headers: { 'set-cookie': 'sb-access-token=secret; Path=/' },
      })
    );
    expect(entries.size).toBe(0);
  });

  it('passes authed and cookie-bearing requests through untouched', async () => {
    const { entries, store } = memoryStore();
    await serveWithEdgePageCache({
      options: options(store),
      render: async () => html(),
      request: page('/tutur3u/platform'),
    });
    expect(entries.size).toBe(1);

    const render = vi.fn(async () => html('<main>private</main>'));
    const credentialHeaders: Record<string, string>[] = [
      { cookie: 'sb-access-token=secret' },
      { cookie: 'NEXT_LOCALE=en' },
      { authorization: 'Bearer token' },
    ];
    for (const headers of credentialHeaders) {
      const response = await serveWithEdgePageCache({
        options: options(store),
        render,
        request: page('/tutur3u/platform', headers),
      });
      expect(await response.text()).toBe('<main>private</main>');
      expect(response.headers.get(EDGE_CACHE_HEADER)).toBeNull();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(render).toHaveBeenCalledTimes(3);
    expect(entries.size).toBe(1);
  });

  it('keeps locales apart', async () => {
    const { store } = memoryStore();
    const run = (language: string) =>
      serveWithEdgePageCache({
        options: options(store),
        render: async () => html(`<main>${language}</main>`),
        request: page('/tutur3u/platform', { 'accept-language': language }),
      }).then((response) => response.text());

    await run('en');
    await run('vi');
    expect(await run('en')).toBe('<main>en</main>');
    expect(await run('vi')).toBe('<main>vi</main>');
  });

  it('writes through waitUntil and survives a failing store', async () => {
    const pending: Promise<unknown>[] = [];
    const { entries, store } = memoryStore();
    await serveWithEdgePageCache({
      options: options(store, { waitUntil: (work) => void pending.push(work) }),
      render: async () => html(),
      request: page('/tutur3u/platform'),
    });
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(entries.size).toBe(1);

    const broken: EdgePageCacheStore = {
      match: async () => {
        throw new Error('match');
      },
      put: async () => {
        throw new Error('put');
      },
    };
    const response = await serveWithEdgePageCache({
      options: options(broken),
      render: async () => html('<main>ok</main>'),
      request: page('/tutur3u/platform'),
    });
    expect(await response.text()).toBe('<main>ok</main>');
  });
});
