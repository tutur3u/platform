import { describe, expect, it, vi } from 'vitest';
import {
  cachedGitHubFetch,
  GITHUB_CACHE_TTL_SECONDS,
  type GitHubCacheStore,
  githubCacheKey,
  githubCacheTtlSeconds,
} from './response-cache';

const SHA = 'a'.repeat(40);
const repoUrl = (path: string) =>
  new URL(`https://api.github.com/repos/tutur3u/platform${path}`);

function memoryStore() {
  const entries = new Map<string, Response>();
  const store: GitHubCacheStore = {
    match: async (request) => entries.get(request.url)?.clone(),
    put: async (request, response) => {
      entries.set(request.url, response);
    },
  };
  return { entries, store };
}

function jsonResponse(status: number, body: unknown = { ok: true }, headers = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });
}

describe('githubCacheTtlSeconds', () => {
  it('caches commit-addressed content for a day', () => {
    expect(githubCacheTtlSeconds(repoUrl(`/commits/${SHA}`), 200)).toBe(
      GITHUB_CACHE_TTL_SECONDS.immutable
    );
    expect(
      githubCacheTtlSeconds(repoUrl(`/contents/turbo.json?ref=${SHA}`), 200)
    ).toBe(86_400);
    expect(
      githubCacheTtlSeconds(repoUrl(`/compare/${SHA}...${'b'.repeat(40)}`), 200)
    ).toBe(86_400);
  });

  it('caches branch, tag and default-branch content briefly', () => {
    expect(githubCacheTtlSeconds(repoUrl('/contents/x?ref=main'), 200)).toBe(
      300
    );
    expect(githubCacheTtlSeconds(repoUrl('/contents/x'), 200)).toBe(300);
    expect(githubCacheTtlSeconds(repoUrl('/commits/main'), 200)).toBe(300);
    expect(githubCacheTtlSeconds(repoUrl('/commits?page=1'), 200)).toBe(300);
  });

  it.each([
    `/commits/${SHA}/check-runs`,
    `/commits/${SHA}/check-suites`,
    `/commits/${SHA}/status`,
    `/commits/main/statuses`,
    `/statuses/${SHA}`,
    '/check-runs/123',
    '/check-suites/456',
  ])('caches check data at %s for a minute', (path) => {
    expect(githubCacheTtlSeconds(repoUrl(path), 200)).toBe(
      GITHUB_CACHE_TTL_SECONDS.checks
    );
  });

  it('keeps commit content on a SHA immutable next to its check data', () => {
    expect(githubCacheTtlSeconds(repoUrl(`/commits/${SHA}`), 200)).toBe(
      GITHUB_CACHE_TTL_SECONDS.immutable
    );
    expect(githubCacheTtlSeconds(repoUrl('/commits/main'), 200)).toBe(300);
  });

  it('caches not-found for a minute', () => {
    expect(githubCacheTtlSeconds(repoUrl(`/commits/${SHA}`), 404)).toBe(60);
  });

  it.each([500, 502, 503, 403, 429, 301, 304, 401])(
    'never caches status %i',
    (status) => {
      expect(githubCacheTtlSeconds(repoUrl('/'), status)).toBe(0);
    }
  );
});

describe('githubCacheKey', () => {
  const base = { accept: 'application/vnd.github+json', url: repoUrl('/x') };

  it('ignores query order and fragments', () => {
    const a = githubCacheKey({
      ...base,
      authScope: 'anonymous',
      url: repoUrl('/x?b=2&a=1#frag'),
    });
    const b = githubCacheKey({
      ...base,
      authScope: 'anonymous',
      url: repoUrl('/x?a=1&b=2'),
    });
    expect(a.url).toBe(b.url);
  });

  it('separates auth scopes, accept types and methods', () => {
    const keys = new Set([
      githubCacheKey({ ...base, authScope: 'anonymous' }).url,
      githubCacheKey({ ...base, authScope: 'app:1' }).url,
      githubCacheKey({ ...base, authScope: 'app:2' }).url,
      githubCacheKey({ ...base, accept: 'text/plain', authScope: 'app:1' }).url,
      githubCacheKey({ ...base, authScope: 'app:1', method: 'HEAD' }).url,
    ]);
    expect(keys.size).toBe(5);
  });
});

describe('cachedGitHubFetch', () => {
  const accept = 'application/vnd.github+json';

  it('misses, stores, then serves the next request from the cache', async () => {
    const { store } = memoryStore();
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { n: 1 }, { link: '<next>; rel="next"' })
    );
    const call = () =>
      cachedGitHubFetch({
        accept,
        authScope: 'app:1',
        cache: { store },
        fetcher,
        headers: {},
        url: repoUrl('/contents/a?ref=main'),
      });

    expect(await (await call()).json()).toEqual({ n: 1 });
    const hit = await call();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await hit.json()).toEqual({ n: 1 });
    expect(hit.headers.get('link')).toBe('<next>; rel="next"');
  });

  it('writes through waitUntil when the runtime provides one', async () => {
    const { entries, store } = memoryStore();
    const pending: Promise<unknown>[] = [];
    await cachedGitHubFetch({
      accept,
      authScope: 'anonymous',
      cache: { store, waitUntil: (work) => void pending.push(work) },
      fetcher: async () => jsonResponse(200),
      headers: {},
      url: repoUrl('/'),
    });
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(entries.size).toBe(1);
  });

  it('expires entries by their TTL', async () => {
    const { store } = memoryStore();
    let clock = 1_000_000;
    const fetcher = vi.fn(async () => jsonResponse(200));
    const call = () =>
      cachedGitHubFetch({
        accept,
        authScope: 'anonymous',
        cache: { store },
        fetcher,
        headers: {},
        now: () => clock,
        url: repoUrl('/contents/a?ref=main'),
      });

    await call();
    clock += 299_000;
    await call();
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock += 2_000;
    await call();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps a commit-addressed entry past the branch TTL', async () => {
    const { store } = memoryStore();
    let clock = 0;
    const fetcher = vi.fn(async () => jsonResponse(200));
    const call = () =>
      cachedGitHubFetch({
        accept,
        authScope: 'anonymous',
        cache: { store },
        fetcher,
        headers: {},
        now: () => clock,
        url: repoUrl(`/commits/${SHA}`),
      });

    await call();
    clock += 86_000_000;
    await call();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('replays a not-found for a minute', async () => {
    const { store } = memoryStore();
    let clock = 0;
    const fetcher = vi.fn(async () => jsonResponse(404, { message: 'Not Found' }));
    const call = () =>
      cachedGitHubFetch({
        accept,
        authScope: 'anonymous',
        cache: { store },
        fetcher,
        headers: {},
        now: () => clock,
        url: repoUrl('/contents/missing'),
      });

    expect((await call()).status).toBe(404);
    expect((await call()).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock += 61_000;
    await call();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([500, 502, 503, 403, 429])(
    'never stores a %i response',
    async (status) => {
      const { entries, store } = memoryStore();
      const fetcher = vi.fn(async () =>
        jsonResponse(status, { message: 'rate limit' }, { 'retry-after': '60' })
      );
      const call = () =>
        cachedGitHubFetch({
          accept,
          authScope: 'anonymous',
          cache: { store },
          fetcher,
          headers: {},
          url: repoUrl('/'),
        });

      expect((await call()).status).toBe(status);
      await call();
      expect(entries.size).toBe(0);
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  );

  it('never serves a response across auth scopes', async () => {
    const { store } = memoryStore();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { who: 'one' }))
      .mockResolvedValueOnce(jsonResponse(200, { who: 'two' }))
      .mockResolvedValueOnce(jsonResponse(200, { who: 'anon' }));
    const call = (authScope: string) =>
      cachedGitHubFetch({
        accept,
        authScope,
        cache: { store },
        fetcher,
        headers: {},
        url: repoUrl('/'),
      }).then((response) => response.json());

    expect(await call('app:1')).toEqual({ who: 'one' });
    expect(await call('app:2')).toEqual({ who: 'two' });
    expect(await call('anonymous')).toEqual({ who: 'anon' });
    expect(await call('app:1')).toEqual({ who: 'one' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('stores no credential material', async () => {
    const { entries, store } = memoryStore();
    await cachedGitHubFetch({
      accept,
      authScope: 'app:1',
      cache: { store },
      fetcher: async () =>
        jsonResponse(200, {}, { 'set-cookie': 'a=b', 'x-ratelimit-remaining': '9' }),
      headers: { Authorization: 'Bearer secret-token' },
      url: repoUrl('/'),
    });
    const entry = [...entries.entries()][0];
    if (!entry) throw new Error('expected one stored response');
    const [key, stored] = entry;
    expect(key).not.toContain('secret-token');
    expect(stored.headers.get('set-cookie')).toBeNull();
    expect(stored.headers.get('x-ratelimit-remaining')).toBeNull();
  });

  it('calls through without a cache and for non-GET methods', async () => {
    const { entries, store } = memoryStore();
    const fetcher = vi.fn(async () => jsonResponse(200));
    await cachedGitHubFetch({
      accept,
      authScope: 'anonymous',
      cache: null,
      fetcher,
      headers: {},
      url: repoUrl('/'),
    });
    await cachedGitHubFetch({
      accept,
      authScope: 'anonymous',
      cache: { store },
      fetcher,
      headers: {},
      method: 'POST',
      url: repoUrl('/'),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(entries.size).toBe(0);
  });

  it('survives a failing store', async () => {
    const store: GitHubCacheStore = {
      match: async () => {
        throw new Error('match failed');
      },
      put: async () => {
        throw new Error('put failed');
      },
    };
    const response = await cachedGitHubFetch({
      accept,
      authScope: 'anonymous',
      cache: { store },
      fetcher: async () => jsonResponse(200, { ok: 1 }),
      headers: {},
      url: repoUrl('/'),
    });
    expect(await response.json()).toEqual({ ok: 1 });
  });
});
