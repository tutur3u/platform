import { describe, expect, it, vi } from 'vitest';
import {
  createDeliveryEdgeCache,
  DELIVERY_PUBLIC_CACHE_CONTROL,
  deliveryCacheKey,
  deliveryEtag,
} from './delivery-edge-cache';
import type { DeliveryState } from './delivery-state';
import {
  isCmsEdgeCacheEnabled,
  putEdgeCacheEntry,
  resolveDefaultEdgeCache,
  VERSION_MEMO_TTL_MS,
} from './edge-cache-core';
import { createFakeClock, createFakeEdgeCache } from './edge-cache-test-utils';

const WS_A = '123e4567-e89b-12d3-a456-426614174000';
const WS_B = '223e4567-e89b-12d3-a456-426614174000';

function state(version: number, overrides: Partial<DeliveryState> = {}) {
  return {
    adapter: 'custom',
    bindingFingerprint: 'fp1',
    canonicalId: 'canonical',
    canonicalProject: { id: 'canonical' },
    enabled: true,
    settings: null,
    version,
    ...overrides,
  } as DeliveryState;
}

function setup(initial: DeliveryState | ((id: string) => DeliveryState)) {
  const fake = createFakeEdgeCache();
  const clock = createFakeClock();
  let current = initial;
  const readState = vi.fn(async (id: string) =>
    typeof current === 'function' ? current(id) : current
  );
  const edge = createDeliveryEdgeCache({
    getCache: () => fake.cache,
    now: clock.now,
    readState,
  });
  const build = vi.fn(
    async (
      s: DeliveryState
    ): Promise<{ revision: string; version?: number }> => ({
      revision: `rev-${s.version}`,
      version: s.version,
    })
  );
  const serve = (wsId = WS_A, ifNoneMatch: string | null = null) =>
    edge.serve({
      build,
      ifNoneMatch,
      includeDrafts: false,
      workspaceId: wsId,
    });
  return {
    build,
    clock,
    edge,
    fake,
    readState,
    serve,
    setState(next: DeliveryState | ((id: string) => DeliveryState)) {
      current = next;
    },
  };
}

describe('deliveryCacheKey', () => {
  it('contains the workspace and version, and differs per workspace', () => {
    const a = deliveryCacheKey(WS_A, 7, 'fp');
    const b = deliveryCacheKey(WS_B, 7, 'fp');
    expect(a).toBe(`https://cms-cache.internal/delivery/v1/${WS_A}/7/fp`);
    expect(a).not.toBe(b);
    expect(deliveryCacheKey(WS_A, 8, 'fp')).not.toBe(a);
    expect(deliveryCacheKey(WS_A, 7, 'other')).not.toBe(a);
  });

  it('cannot be steered out of its segment by a hostile fingerprint', () => {
    expect(deliveryCacheKey(WS_A, 1, '../x/1')).not.toContain('../');
  });
});

describe('published delivery edge cache', () => {
  it('builds on a miss, stores a 200, and serves the next request from the cache', async () => {
    const t = setup(state(1));
    const miss = await t.serve();
    expect(miss?.status).toBe(200);
    expect(miss?.headers.get('x-tuturuuu-delivery-cache')).toBe('MISS');
    expect(miss?.headers.get('x-tuturuuu-delivery-version')).toBe('1');
    expect(miss?.headers.get('cache-control')).toBe(
      DELIVERY_PUBLIC_CACHE_CONTROL
    );
    expect(DELIVERY_PUBLIC_CACHE_CONTROL).toBe(
      'public, max-age=0, s-maxage=5, stale-while-revalidate=30'
    );
    expect(miss?.headers.get('etag')).toBe('W/"rev-1-v1"');
    expect(t.fake.calls.put).toHaveLength(1);

    const hit = await t.serve();
    expect(hit?.status).toBe(200);
    expect(hit?.headers.get('x-tuturuuu-delivery-cache')).toBe('HIT');
    expect(hit?.headers.get('cache-control')).toBe(
      DELIVERY_PUBLIC_CACHE_CONTROL
    );
    expect(await hit?.json()).toEqual({ revision: 'rev-1', version: 1 });
    expect(t.build).toHaveBeenCalledTimes(1);
    expect(t.fake.calls.put).toHaveLength(1);
  });

  it('answers a matching If-None-Match with a 304 and builds nothing', async () => {
    const t = setup(state(1));
    await t.serve();
    t.build.mockClear();
    const response = await t.serve(WS_A, 'W/"rev-1-v1"');
    expect(response?.status).toBe(304);
    expect(response?.headers.get('x-tuturuuu-delivery-cache')).toBe('HIT');
    expect(response?.headers.get('etag')).toBe('W/"rev-1-v1"');
    expect(await response?.text()).toBe('');
    expect(t.build).not.toHaveBeenCalled();
  });

  it('changes the ETag when only the version moves, so a stale tag gets no 304', async () => {
    const t = setup(state(1));
    t.build.mockImplementation(async () => ({ revision: 'same-revision' }));
    const first = await t.serve();
    expect(first?.headers.get('etag')).toBe('W/"same-revision-v1"');
    t.setState(state(2));
    t.clock.advance(VERSION_MEMO_TTL_MS + 1);
    const second = await t.serve(WS_A, 'W/"same-revision-v1"');
    expect(second?.status).toBe(200);
    expect(second?.headers.get('etag')).toBe('W/"same-revision-v2"');
    expect(deliveryEtag('same-revision', 1)).not.toBe(
      deliveryEtag('same-revision', 2)
    );
  });

  it('serves the body when If-None-Match is stale', async () => {
    const t = setup(state(1));
    await t.serve();
    const response = await t.serve(WS_A, 'W/"older"');
    expect(response?.status).toBe(200);
    expect(response?.headers.get('x-tuturuuu-delivery-cache')).toBe('HIT');
  });

  it('treats a version bump as a miss and rebuilds', async () => {
    const t = setup(state(1));
    await t.serve();
    t.setState(state(2));
    t.clock.advance(VERSION_MEMO_TTL_MS + 1);
    const response = await t.serve();
    expect(response?.headers.get('x-tuturuuu-delivery-cache')).toBe('MISS');
    expect(response?.headers.get('x-tuturuuu-delivery-version')).toBe('2');
    expect(await response?.json()).toEqual({ revision: 'rev-2', version: 2 });
    expect(t.build).toHaveBeenCalledTimes(2);
    expect(new Set(t.fake.calls.put).size).toBe(2);
  });

  it('treats a binding fingerprint change as a miss at the same version', async () => {
    const t = setup(state(1));
    await t.serve();
    t.setState(state(1, { bindingFingerprint: 'fp2' }));
    t.clock.advance(VERSION_MEMO_TTL_MS + 1);
    const response = await t.serve();
    expect(response?.headers.get('x-tuturuuu-delivery-cache')).toBe('MISS');
    expect(t.build).toHaveBeenCalledTimes(2);
  });

  it('never serves one workspace the entry of another', async () => {
    const t = setup(() => state(1));
    await t.serve(WS_A);
    const other = await t.serve(WS_B);
    expect(other?.headers.get('x-tuturuuu-delivery-cache')).toBe('MISS');
    expect(t.build).toHaveBeenCalledTimes(2);
    expect(t.fake.calls.put[0]).toContain(WS_A);
    expect(t.fake.calls.put[1]).toContain(WS_B);
    expect(t.fake.calls.put[0]).not.toBe(t.fake.calls.put[1]);
  });

  it('reuses a version read for at most 2 s and shares one in-flight read', async () => {
    const t = setup(state(1));
    expect(VERSION_MEMO_TTL_MS).toBeLessThanOrEqual(2000);
    expect(t.edge.states.ttlMs).toBeLessThanOrEqual(2000);
    await Promise.all([t.serve(), t.serve(), t.serve()]);
    expect(t.readState).toHaveBeenCalledTimes(1);
    t.clock.advance(1999);
    await t.serve();
    expect(t.readState).toHaveBeenCalledTimes(1);
    t.clock.advance(2);
    await t.serve();
    expect(t.readState).toHaveBeenCalledTimes(2);
  });

  it('clamps a longer configured memo to 2 s', () => {
    const edge = createDeliveryEdgeCache({
      getCache: () => null,
      readState: async () => state(1),
      stateTtlMs: 60_000,
    });
    expect(edge.states.ttlMs).toBe(2000);
  });

  it('builds once for concurrent misses on the same key', async () => {
    const t = setup(state(1));
    const gate = Promise.withResolvers<void>();
    t.build.mockImplementation(async (s) => {
      await gate.promise;
      return { revision: `rev-${s.version}` };
    });
    const pending = [t.serve(), t.serve(), t.serve(), t.serve()];
    await vi.waitFor(() => expect(t.build).toHaveBeenCalledTimes(1));
    gate.resolve();
    const responses = await Promise.all(pending);
    expect(responses.every((r) => r?.status === 200)).toBe(true);
    expect(t.build).toHaveBeenCalledTimes(1);
    expect(t.fake.calls.put).toHaveLength(1);
  });

  it('a miss answers 304 when the client already holds the built revision', async () => {
    const t = setup(state(1));
    const response = await t.serve(WS_A, 'W/"rev-1-v1"');
    expect(response?.status).toBe(304);
    expect(response?.headers.get('x-tuturuuu-delivery-cache')).toBe('MISS');
    expect(t.fake.calls.put).toHaveLength(1);
  });

  it('refuses drafts without touching the cache', async () => {
    const t = setup(state(1));
    await expect(
      t.edge.serve({
        build: t.build,
        ifNoneMatch: null,
        includeDrafts: true as unknown as false,
        workspaceId: WS_A,
      })
    ).rejects.toThrow(/never edge-cached/);
    expect(t.fake.calls.match).toHaveLength(0);
    expect(t.fake.calls.put).toHaveLength(0);
    expect(t.readState).not.toHaveBeenCalled();
    expect(t.build).not.toHaveBeenCalled();
  });

  it('stores nothing and rethrows when the build fails', async () => {
    const t = setup(state(1));
    t.build.mockRejectedValueOnce(new Error('boom'));
    await expect(t.serve()).rejects.toThrow('boom');
    expect(t.fake.calls.put).toHaveLength(0);
    const retry = await t.serve();
    expect(retry?.status).toBe(200);
  });

  it('returns null without matching or building for a disabled workspace', async () => {
    const t = setup(
      state(0, { canonicalProject: null, enabled: false, canonicalId: null })
    );
    expect(await t.serve()).toBeNull();
    expect(t.fake.calls.match).toHaveLength(0);
    expect(t.build).not.toHaveBeenCalled();
  });

  it('reports BYPASS and still builds when the runtime has no cache', async () => {
    const edge = createDeliveryEdgeCache({
      getCache: () => null,
      readState: async () => state(3),
    });
    const build = vi.fn(async () => ({ revision: 'r' }));
    const response = await edge.serve({
      build,
      ifNoneMatch: null,
      includeDrafts: false,
      workspaceId: WS_A,
    });
    expect(response?.status).toBe(200);
    expect(response?.headers.get('x-tuturuuu-delivery-cache')).toBe('BYPASS');
    expect(response?.headers.get('x-tuturuuu-delivery-version')).toBe('3');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('survives a failing cache match and put', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const edge = createDeliveryEdgeCache({
      getCache: () => ({
        match: async () => {
          throw new Error('match down');
        },
        put: async () => {
          throw new Error('put down');
        },
      }),
      readState: async () => state(1),
    });
    const response = await edge.serve({
      build: async () => ({ revision: 'r' }),
      ifNoneMatch: null,
      includeDrafts: false,
      workspaceId: WS_A,
    });
    expect(response?.status).toBe(200);
    warn.mockRestore();
  });
});

describe('putEdgeCacheEntry', () => {
  const request = new Request('https://cms-cache.internal/x');

  it('stores only a plain public 200', async () => {
    const fake = createFakeEdgeCache();
    const headers = { 'Cache-Control': 'public, max-age=60' };
    for (const status of [201, 204, 206, 301, 304, 400, 404, 500, 503]) {
      const body = [204, 304].includes(status) ? null : 'x';
      expect(
        await putEdgeCacheEntry(
          fake.cache,
          request,
          new Response(body, { headers, status })
        )
      ).toBe(false);
    }
    expect(fake.calls.put).toHaveLength(0);
    expect(
      await putEdgeCacheEntry(
        fake.cache,
        request,
        new Response('x', { headers, status: 200 })
      )
    ).toBe(true);
    expect(fake.calls.put).toHaveLength(1);
  });

  it('refuses private and no-store responses', async () => {
    const fake = createFakeEdgeCache();
    for (const value of [
      'private, max-age=60',
      'no-store',
      'public, no-store',
    ]) {
      expect(
        await putEdgeCacheEntry(
          fake.cache,
          request,
          new Response('x', { headers: { 'Cache-Control': value } })
        )
      ).toBe(false);
    }
    expect(fake.calls.put).toHaveLength(0);
  });
});

describe('edge cache fence and runtime detection', () => {
  it('bypasses when CMS_DELIVERY_EDGE_CACHE is 0', () => {
    expect(isCmsEdgeCacheEnabled({ CMS_DELIVERY_EDGE_CACHE: '0' })).toBe(false);
    expect(isCmsEdgeCacheEnabled({ CMS_DELIVERY_EDGE_CACHE: ' 0 ' })).toBe(
      false
    );
    expect(isCmsEdgeCacheEnabled({ CMS_DELIVERY_EDGE_CACHE: '1' })).toBe(true);
    expect(isCmsEdgeCacheEnabled({})).toBe(true);
  });

  it('finds no cache off Workers and the default cache on Workers', () => {
    const original = (globalThis as { caches?: unknown }).caches;
    try {
      (globalThis as { caches?: unknown }).caches = undefined;
      expect(resolveDefaultEdgeCache()).toBeNull();
      const fake = createFakeEdgeCache();
      (globalThis as { caches?: unknown }).caches = { default: fake.cache };
      expect(resolveDefaultEdgeCache()).toBe(fake.cache);
      (globalThis as { caches?: unknown }).caches = { default: {} };
      expect(resolveDefaultEdgeCache()).toBeNull();
    } finally {
      (globalThis as { caches?: unknown }).caches = original;
    }
  });
});
