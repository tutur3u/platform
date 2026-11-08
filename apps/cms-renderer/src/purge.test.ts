import { describe, expect, it } from 'vitest';
import { cacheRequest } from './cache-key';
import { purgePage } from './purge';
import { workspaceCacheEpoch } from './workspace-cache';

const origin = 'https://first.invalid';
const tokensJson = JSON.stringify({ a: 'a'.repeat(64), b: 'b'.repeat(64) });
const scope = (site: string) => ({
  origin,
  site,
  workspaceId:
    site === 'a'
      ? '00000000-0000-4000-8000-000000000001'
      : '00000000-0000-4000-8000-000000000002',
});
function harness() {
  const entries = new Map<string, Response>();
  const counts = new Map<string, number>();
  const limiter = {
    limit: async ({ key }: { key: string }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= 2 };
    },
  };
  const cache = {
    match: async (key: RequestInfo | URL) =>
      entries.get(new Request(key).url)?.clone(),
    put: async (key: RequestInfo | URL, value: Response) => {
      entries.set(new Request(key).url, value.clone());
    },
  };
  const request = (
    siteId: string,
    body: unknown,
    contentType: string | null = 'application/json',
    authorization = `Bearer ${siteId.repeat(64)}`
  ) => {
    const headers = new Headers({ authorization });
    if (contentType) headers.set('content-type', contentType);
    return new Request(`${origin}/__cms/purge`, {
      method: 'POST',
      headers,
      body: new TextEncoder().encode(JSON.stringify(body)),
    });
  };
  const run = (
    siteId = 'a',
    body: unknown = { scope: 'workspace' },
    contentType: string | null = 'application/json',
    authorization = `Bearer ${siteId.repeat(64)}`
  ) =>
    purgePage({
      request: request(siteId, body, contentType, authorization),
      siteId,
      workspaceId: scope(siteId).workspaceId,
      origin,
      tokensJson,
      limiter,
      cache,
    });
  return { counts, run, request, cache };
}

describe('host-scoped workspace purge', () => {
  it('invalidates all workspace paths without affecting another site or workspace', async () => {
    const h = harness();
    const beforeA = await workspaceCacheEpoch(scope('a'), h.cache);
    const beforeB = await workspaceCacheEpoch(scope('b'), h.cache);
    for (const path of ['/', '/en', '/en/about']) {
      await h.cache.put(
        cacheRequest({
          ...scope('a'),
          path,
          locale: 'en',
          version: 'v1',
          epoch: beforeA,
        }),
        new Response('old cached page')
      );
    }
    expect((await h.run()).status).toBe(204);
    const afterA = await workspaceCacheEpoch(scope('a'), h.cache);
    expect(afterA).not.toBe(beforeA);
    expect(await workspaceCacheEpoch(scope('b'), h.cache)).toBe(beforeB);
    for (const path of ['/', '/en', '/en/about']) {
      expect(
        await h.cache.match(
          cacheRequest({
            ...scope('a'),
            path,
            locale: 'en',
            version: 'v1',
            epoch: afterA,
          })
        )
      ).toBeUndefined();
    }
    // A request already rendering during purge can fill only the old namespace.
    await h.cache.put(
      cacheRequest({
        ...scope('a'),
        path: '/',
        locale: 'en',
        version: 'v1',
        epoch: beforeA,
      }),
      new Response('late old fill')
    );
    expect(
      await h.cache.match(
        cacheRequest({
          ...scope('a'),
          path: '/',
          locale: 'en',
          version: 'v1',
          epoch: afterA,
        })
      )
    ).toBeUndefined();
  });
  it('limits each site independently before namespace rotation', async () => {
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
  it('returns 401 for Authorization values longer than 600 characters', async () => {
    const h = harness();
    expect(
      (
        await h.run(
          'a',
          { scope: 'workspace' },
          'application/json',
          `Bearer ${'x'.repeat(594)}`
        )
      ).status
    ).toBe(401);
  });
  it.each([null, 'text/plain', 'application/jsonp'])(
    'rejects non-JSON content type %s before namespace rotation',
    async (contentType) => {
      const h = harness();
      const before = await workspaceCacheEpoch(scope('a'), h.cache);
      expect(
        (await h.run('a', { scope: 'workspace' }, contentType)).status
      ).toBe(415);
      expect(await workspaceCacheEpoch(scope('a'), h.cache)).toBe(before);
    }
  );
  it('accepts application/json with a charset parameter', async () => {
    expect(
      (
        await harness().run(
          'a',
          { scope: 'workspace' },
          'application/json; charset=utf-8'
        )
      ).status
    ).toBe(204);
  });
  it.each([
    {},
    { scope: 'all' },
    { scope: 'site' },
    { scope: 'workspace', workspaceId: 'other' },
    { scope: 'workspace', siteId: 'b' },
    { scope: 'workspace', path: '/en' },
    { scope: 'workspace', tag: 'other' },
    { scope: 'workspace', version: 'v1' },
  ])('rejects unknown scopes or caller-selected targets', async (body) => {
    const h = harness();
    const before = await workspaceCacheEpoch(scope('a'), h.cache);
    expect((await h.run('a', body)).status).toBe(400);
    expect(await workspaceCacheEpoch(scope('a'), h.cache)).toBe(before);
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
      const before = await workspaceCacheEpoch(scope('a'), h.cache);
      const response = await purgePage({
        request: h.request('a', { scope: 'workspace' }),
        siteId: 'a',
        workspaceId: scope('a').workspaceId,
        origin,
        tokensJson,
        limiter,
        cache: h.cache,
      });
      expect(response.status).toBe(503);
      expect(await workspaceCacheEpoch(scope('a'), h.cache)).toBe(before);
    }
  });
});
