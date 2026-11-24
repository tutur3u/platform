import { describe, expect, it, vi } from 'vitest';
import {
  ASSET_PUBLIC_CACHE_CONTROL,
  assetCacheKey,
  assetEtag,
  assetTransformKey,
  createAssetEdgeCache,
} from './asset-edge-cache';
import { createSingleFlightMemo, VERSION_MEMO_TTL_MS } from './edge-cache-core';
import { createFakeEdgeCache } from './edge-cache-test-utils';

const WS_A = '123e4567-e89b-12d3-a456-426614174000';
const WS_B = '223e4567-e89b-12d3-a456-426614174000';
const DIGEST = 'a'.repeat(64);
const none = { ifNoneMatch: null, range: null };

function setup(version = 1) {
  const fake = createFakeEdgeCache();
  let current = version;
  const cache = createAssetEdgeCache({
    getCache: () => fake.cache,
    isEnabled: () => true,
    readVersion: async () => current,
  });
  return {
    cache,
    fake,
    setVersion(next: number) {
      current = next;
    },
  };
}

async function publish(
  slot: NonNullable<
    Awaited<ReturnType<ReturnType<typeof setup>['cache']['open']>>
  >,
  body = 'published bytes',
  headers: Record<string, string> = { 'Content-Type': 'image/png' }
) {
  const full = new Response(body, {
    headers: { ...headers, ...slot.headers(DIGEST) },
  });
  await slot.store(full.clone());
  return slot.respond(full, none);
}

const input = (overrides = {}) => ({
  assetId: 'asset-1',
  revision: '20261120090000',
  transform: undefined,
  workspaceId: WS_A,
  ...overrides,
});

describe('asset cache key', () => {
  const base = {
    assetId: 'asset-1',
    deliveryVersion: 3,
    revision: 'r1',
    transform: undefined,
    workspaceId: WS_A,
  };

  it('contains workspace, asset, revision, transform and delivery version', () => {
    const key = assetCacheKey({
      ...base,
      transform: { quality: 80, width: 640 },
    });
    expect(key).toBe(
      `https://cms-cache.internal/asset/v1/${WS_A}/asset-1/r1/q80-w640/3`
    );
  });

  it('differs per workspace, asset, revision, transform and version', () => {
    const key = assetCacheKey(base);
    for (const change of [
      { workspaceId: WS_B },
      { assetId: 'asset-2' },
      { revision: 'r2' },
      { transform: { width: 640 } },
      { deliveryVersion: 4 },
    ])
      expect(assetCacheKey({ ...base, ...change })).not.toBe(key);
  });

  it('normalizes the transform regardless of property order', () => {
    expect(assetTransformKey({ width: 640, height: 480, quality: 80 })).toBe(
      assetTransformKey({ quality: 80, height: 480, width: 640 })
    );
    expect(assetTransformKey({ width: 640 })).not.toBe(
      assetTransformKey({ height: 640 })
    );
    expect(assetTransformKey(undefined)).toBe('original');
  });

  it('tags variants separately from the original', () => {
    expect(assetEtag(DIGEST, undefined)).toBe(`"${DIGEST}"`);
    expect(assetEtag(DIGEST, { width: 640 })).not.toBe(
      assetEtag(DIGEST, undefined)
    );
  });
});

describe('published asset edge cache', () => {
  it('stores a verified 200 and serves it on the next request', async () => {
    const t = setup();
    const slot = await t.cache.open(input());
    expect(slot).not.toBeNull();
    expect(await slot?.hit(none)).toBeNull();
    const first = await publish(slot as never);
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe(ASSET_PUBLIC_CACHE_CONTROL);
    expect(ASSET_PUBLIC_CACHE_CONTROL).toBe(
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
    );
    expect(first.headers.get('x-tuturuuu-delivery-cache')).toBe('MISS');
    expect(first.headers.get('etag')).toBe(`"${DIGEST}"`);

    const next = await (await t.cache.open(input()))?.hit(none);
    expect(next?.status).toBe(200);
    expect(next?.headers.get('x-tuturuuu-delivery-cache')).toBe('HIT');
    expect(next?.headers.get('content-type')).toBe('image/png');
    expect(await next?.text()).toBe('published bytes');
  });

  it('answers If-None-Match with a 304 from the stored tag', async () => {
    const t = setup();
    await publish((await t.cache.open(input())) as never);
    const slot = await t.cache.open(input());
    const response = await slot?.hit({
      ifNoneMatch: `"${DIGEST}"`,
      range: null,
    });
    expect(response?.status).toBe(304);
    expect(response?.headers.get('etag')).toBe(`"${DIGEST}"`);
    expect(response?.headers.get('cache-control')).toBe(
      ASSET_PUBLIC_CACHE_CONTROL
    );
    expect(await response?.text()).toBe('');
    const stale = await slot?.hit({ ifNoneMatch: '"other"', range: null });
    expect(stale?.status).toBe(200);
  });

  it('cuts ranges from the stored full body', async () => {
    const t = setup();
    await publish((await t.cache.open(input())) as never);
    const slot = await t.cache.open(input());
    const partial = await slot?.hit({ ifNoneMatch: null, range: 'bytes=0-8' });
    expect(partial?.status).toBe(206);
    expect(partial?.headers.get('content-range')).toBe('bytes 0-8/15');
    expect(await partial?.text()).toBe('published');
    const tail = await slot?.hit({ ifNoneMatch: null, range: 'bytes=-5' });
    expect(tail?.status).toBe(206);
    expect(await tail?.text()).toBe('bytes');
    const beyond = await slot?.hit({ ifNoneMatch: null, range: 'bytes=99-' });
    expect(beyond?.status).toBe(416);
    expect(beyond?.headers.get('content-range')).toBe('bytes */15');
  });

  it('cuts a range from a freshly built response too', async () => {
    const t = setup();
    const slot = await t.cache.open(input());
    const full = new Response('published bytes', {
      headers: { 'Content-Type': 'image/png', ...slot?.headers(DIGEST) },
    });
    await slot?.store(full.clone());
    const partial = await slot?.respond(full, {
      ifNoneMatch: null,
      range: 'bytes=10-',
    });
    expect(partial?.status).toBe(206);
    expect(await partial?.text()).toBe('bytes');
    expect(t.fake.calls.put).toHaveLength(1);
  });

  it('ignores ranges for transformed variants', async () => {
    const t = setup();
    const slot = await t.cache.open(input({ transform: { width: 640 } }));
    await publish(slot as never);
    const response = await (
      await t.cache.open(input({ transform: { width: 640 } }))
    )?.hit({ ifNoneMatch: null, range: 'bytes=0-3' });
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe('published bytes');
  });

  it('keeps variants and originals on separate entries', async () => {
    const t = setup();
    await publish((await t.cache.open(input())) as never);
    const variant = await t.cache.open(input({ transform: { width: 640 } }));
    expect(await variant?.hit(none)).toBeNull();
    await publish(variant as never, 'webp bytes');
    const original = await (await t.cache.open(input()))?.hit(none);
    expect(await original?.text()).toBe('published bytes');
    expect(new Set(t.fake.calls.put).size).toBe(2);
  });

  it('never serves one workspace the entry of another', async () => {
    const t = setup();
    await publish((await t.cache.open(input())) as never);
    const other = await t.cache.open(input({ workspaceId: WS_B }));
    expect(await other?.hit(none)).toBeNull();
  });

  it('does not serve an unpublished asset after a version bump', async () => {
    const t = setup(1);
    await publish((await t.cache.open(input())) as never);
    expect(await (await t.cache.open(input()))?.hit(none)).not.toBeNull();
    t.setVersion(2);
    const afterUnpublish = await t.cache.open(input());
    expect(afterUnpublish?.deliveryVersion).toBe(2);
    expect(await afterUnpublish?.hit(none)).toBeNull();
  });

  it('stores nothing but a plain public 200', async () => {
    const t = setup();
    const slot = await t.cache.open(input());
    for (const status of [206, 304, 404, 500]) {
      await slot?.store(
        new Response(status === 304 ? null : 'x', {
          headers: { 'Cache-Control': ASSET_PUBLIC_CACHE_CONTROL },
          status,
        })
      );
    }
    await slot?.store(
      new Response('x', { headers: { 'Cache-Control': 'private, no-store' } })
    );
    expect(t.fake.calls.put).toHaveLength(0);
  });

  it('opens no slot without a revision, with the fence set, or without a version', async () => {
    const fake = createFakeEdgeCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const make = (enabled: boolean, ok = true) =>
      createAssetEdgeCache({
        getCache: () => fake.cache,
        isEnabled: () => enabled,
        readVersion: async () => {
          if (!ok) throw new Error('counter missing');
          return 1;
        },
      });
    expect(await make(true).open(input({ revision: null }))).toBeNull();
    expect(await make(false).open(input())).toBeNull();
    expect(await make(true, false).open(input())).toBeNull();
    expect(fake.calls.match).toHaveLength(0);
    warn.mockRestore();
  });

  it('reports BYPASS and stores nothing where the runtime has no cache', async () => {
    const cache = createAssetEdgeCache({
      getCache: () => null,
      isEnabled: () => true,
      readVersion: async () => 1,
    });
    const slot = await cache.open(input());
    expect(await slot?.hit(none)).toBeNull();
    const response = await publish(slot as never);
    expect(response.headers.get('x-tuturuuu-delivery-cache')).toBe('BYPASS');
  });
});

describe('delivery version memo', () => {
  it('defaults to at most 2 s and shares one in-flight read', async () => {
    let now = 0;
    const read = vi.fn(async () => 1);
    const memo = createSingleFlightMemo({ now: () => now, read });
    expect(memo.ttlMs).toBe(VERSION_MEMO_TTL_MS);
    expect(memo.ttlMs).toBeLessThanOrEqual(2000);
    await Promise.all([memo.get('a'), memo.get('a')]);
    expect(read).toHaveBeenCalledTimes(1);
    now = 2000;
    await memo.get('a');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('drops a failed read so the next call retries', async () => {
    const read = vi
      .fn<(key: string) => Promise<number>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(7);
    const memo = createSingleFlightMemo({ read });
    await expect(memo.get('a')).rejects.toThrow('down');
    expect(await memo.get('a')).toBe(7);
  });
});
