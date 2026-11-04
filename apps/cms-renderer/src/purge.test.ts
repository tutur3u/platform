import { describe, expect, it } from 'vitest';
import { cacheRequest } from './cache-key';
import { purgePage } from './purge';

const version = '11111111-1111-4111-8111-111111111111';
const origin = 'https://first.invalid';
const tokensJson = JSON.stringify({ a: 'a'.repeat(64), b: 'b'.repeat(64) });
function harness() {
  const entries = new Set(
    ['a', 'b'].map(
      (site) =>
        cacheRequest({ origin, site, path: '/', locale: 'vi', version }).url
    )
  );
  const counts = new Map<string, number>();
  const limiter = {
    limit: async ({ key }: { key: string }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= 2 };
    },
  };
  const cache = {
    delete: async (key: RequestInfo | URL) =>
      entries.delete(new Request(key).url),
  };
  const run = (
    siteId = 'a',
    body: unknown = { path: '/', locale: 'vi', version }
  ) =>
    purgePage({
      request: new Request(`${origin}/__cms/purge`, {
        method: 'POST',
        headers: { authorization: `Bearer ${siteId.repeat(64)}` },
        body: JSON.stringify(body),
      }),
      siteId,
      origin,
      tokensJson,
      limiter,
      cache,
    });
  return { entries, counts, run, cache, limiter };
}
describe('site-scoped purge route', () => {
  it('evicts only the selected site cache key, ignoring a body site override', async () => {
    const h = harness();
    expect(
      (
        await h.run('a', {
          path: '/',
          locale: 'vi',
          version,
          siteId: 'b',
          site: 'b',
          origin: 'https://other.invalid',
        })
      ).status
    ).toBe(204);
    expect(h.entries.size).toBe(1);
    expect(
      h.entries.has(
        cacheRequest({ origin, site: 'b', path: '/', locale: 'vi', version })
          .url
      )
    ).toBe(true);
  });
  it('limits each site independently before eviction', async () => {
    const h = harness();
    await h.run();
    await h.run();
    const response = await h.run();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect((await h.run('b')).status).toBe(204);
    expect(h.counts.get('cms-purge:a')).toBe(3);
    expect(h.counts.get('cms-purge:b')).toBe(1);
  });
  it.each([
    { path: '/', locale: 'vi', version: 'not-a-version-id' },
    { path: '/about/', locale: 'vi', version },
    { path: '//other.invalid', locale: 'vi', version },
    { path: '/about?site=b', locale: 'vi', version },
  ])('rejects malformed purge input without evicting any key', async (body) => {
    const h = harness();
    expect((await h.run('a', body)).status).toBe(400);
    expect(h.entries.size).toBe(2);
  });
  it('fails closed for missing or broken limiter bindings', async () => {
    for (const limiter of [
      undefined,
      {
        limit: async () => {
          throw new Error('Unavailable');
        },
      },
    ]) {
      const h = harness();
      const response = await purgePage({
        request: new Request(`${origin}/__cms/purge`, {
          method: 'POST',
          headers: { authorization: `Bearer ${'a'.repeat(64)}` },
          body: JSON.stringify({ path: '/', locale: 'vi', version }),
        }),
        siteId: 'a',
        origin,
        tokensJson,
        limiter,
        cache: h.cache,
      });
      expect(response.status).toBe(503);
      expect(h.entries.size).toBe(2);
    }
  });
});
