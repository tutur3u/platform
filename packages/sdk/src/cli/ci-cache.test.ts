import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCiCache,
  RateBudgetError,
  type Upstream,
  type UpstreamResponse,
} from './ci-cache';

let dir: string;
let clock: number;
const now = () => clock;
const ttl = () => 20_000;

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): UpstreamResponse {
  return {
    status,
    body,
    headers: new Headers({
      'x-ratelimit-remaining': '4000',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-reset': String(Math.floor(clock / 1000) + 3600),
      ...headers,
    }),
  };
}

function recorder(reply: (etag?: string) => UpstreamResponse, delayMs = 0) {
  const calls: { url: string; etag?: string }[] = [];
  const upstream: Upstream = async (url, init) => {
    calls.push({ url, etag: init.etag });
    if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
    return reply(init.etag);
  };
  return { calls, upstream };
}

const cacheWith = (
  upstream: Upstream,
  extra: Partial<Parameters<typeof createCiCache>[0]> = {}
) =>
  createCiCache({
    dir,
    upstream,
    now,
    floor: 300,
    lockPollMs: 5,
    ...extra,
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ttr-ci-cache-'));
  clock = 1_800_000_000_000;
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('single-flight dedup', () => {
  it('collapses concurrent in-process callers into one upstream request', async () => {
    const { calls, upstream } = recorder(
      () => response(200, { n: 1 }, { etag: '"a"' }),
      20
    );
    const cache = cacheWith(upstream);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => cache.get('k', 'https://x/k', { ttl }))
    );
    expect(calls).toHaveLength(1);
    expect(results.every((r) => (r.body as { n: number }).n === 1)).toBe(true);
  });

  it('collapses callers through separate cache instances sharing the cache directory', async () => {
    const { calls, upstream } = recorder(
      () => response(200, { n: 2 }, { etag: '"b"' }),
      40
    );
    // Separate instances have separate in-process maps, like separate lanes.
    const lanes = Array.from({ length: 4 }, () => cacheWith(upstream));
    const results = await Promise.all(
      lanes.map((lane) => lane.get('k', 'https://x/k', { ttl }))
    );
    expect(calls).toHaveLength(1);
    expect(results.map((r) => r.source).sort()).toEqual([
      'cache',
      'cache',
      'cache',
      'fetched',
    ]);
  });

  it('makes competing cache instances wait for the lock owner', async () => {
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const committed = Promise.withResolvers<void>();
    const waiters = Array.from({ length: 3 }, () =>
      Promise.withResolvers<void>()
    );
    let requests = 0;
    const upstream: Upstream = async () => {
      requests++;
      started.resolve();
      await finish.promise;
      return response(200, { n: 2 }, { etag: '"b"' });
    };
    const owner = cacheWith(upstream).get('k', 'https://x/k', { ttl });
    await started.promise;

    const readers = waiters.map((waiter) =>
      cacheWith(upstream, {
        sleep: () => {
          waiter.resolve();
          return committed.promise;
        },
      }).get('k', 'https://x/k', { ttl })
    );
    await Promise.all(waiters.map((waiter) => waiter.promise));
    finish.resolve();
    const result = await owner;
    committed.resolve();

    expect(result.source).toBe('fetched');
    expect((await Promise.all(readers)).map((reader) => reader.source)).toEqual(
      ['cache', 'cache', 'cache']
    );
    expect(requests).toBe(1);
  });

  it('breaks a lock left by a dead process', async () => {
    const { calls, upstream } = recorder(() => response(200, { ok: true }));
    const cache = cacheWith(upstream, { isAlive: () => false });
    const { createHash } = await import('node:crypto');
    const name = createHash('sha256').update('k').digest('hex').slice(0, 40);
    await cache.get('other', 'https://x/other', { ttl }); // creates the dir
    await writeFile(
      join(dir, `${name}.lock`),
      JSON.stringify({ pid: 999_999, token: 't', createdAt: clock })
    );
    const result = await cache.get('k', 'https://x/k', { ttl });
    expect(result.source).toBe('fetched');
    expect(calls.map((c) => c.url)).toContain('https://x/k');
  });
});

describe('TTL and ETag revalidation', () => {
  it('serves a fresh entry without an upstream call, then revalidates with If-None-Match', async () => {
    const { calls, upstream } = recorder((etag) =>
      etag === '"v1"'
        ? response(304, '')
        : response(200, { v: 1 }, { etag: '"v1"' })
    );
    const cache = cacheWith(upstream);
    expect((await cache.get('k', 'u', { ttl })).source).toBe('fetched');
    clock += 19_000;
    expect((await cache.get('k', 'u', { ttl })).source).toBe('cache');
    expect(calls).toHaveLength(1);

    clock += 2_000; // past the 20s TTL
    const revalidated = await cache.get('k', 'u', { ttl });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.etag).toBe('"v1"');
    expect(revalidated).toMatchObject({
      source: 'revalidated',
      stale: false,
      body: { v: 1 },
      fetchedAt: clock,
    });
    // The 304 restarted the TTL.
    clock += 10_000;
    expect((await cache.get('k', 'u', { ttl })).source).toBe('cache');
    expect(calls).toHaveLength(2);
  });

  it('stores the TTL the body selects and replaces the body on a 200', async () => {
    let version = 1;
    const { upstream } = recorder(() =>
      response(200, { version }, { etag: `"v${version}"` })
    );
    const cache = cacheWith(upstream);
    const pick = (body: unknown) =>
      (body as { version: number }).version === 1 ? 5_000 : 60_000;
    await cache.get('k', 'u', { ttl: pick });
    version = 2;
    clock += 6_000;
    expect((await cache.get('k', 'u', { ttl: pick })).body).toEqual({
      version: 2,
    });
    clock += 30_000;
    expect((await cache.get('k', 'u', { ttl: pick })).source).toBe('cache');
  });
});

describe('rate budget backpressure', () => {
  async function seed(etag?: string) {
    const { upstream } = recorder(() =>
      response(200, { seeded: true }, etag ? { etag } : {})
    );
    await cacheWith(upstream).get('k', 'u', { ttl });
    clock += 30_000; // stale
  }
  const lowLedger = (remaining: number) =>
    writeFile(
      join(dir, 'rate.json'),
      JSON.stringify({ remaining, limit: 5000, resetAt: clock + 600_000 })
    );

  it('admits only one distinct key when one request remains above the floor', async () => {
    const { calls, upstream } = recorder(
      () =>
        response(
          200,
          { ok: true },
          {
            'x-ratelimit-remaining': '299',
            'x-ratelimit-reset': String((clock + 600_000) / 1000),
          }
        ),
      20
    );
    await lowLedger(300);
    const results = await Promise.allSettled(
      ['first', 'second'].map((key) =>
        cacheWith(upstream).get(key, `https://x/${key}`, { ttl })
      )
    );
    expect(calls).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(results).toContainEqual({
      status: 'rejected',
      reason: expect.any(RateBudgetError),
    });
  });

  it('serves stale data without an upstream call below the floor when no ETag exists', async () => {
    await seed();
    await lowLedger(100);
    const { calls, upstream } = recorder(() => response(200, {}));
    const result = await cacheWith(upstream).get('k', 'u', { ttl });
    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({
      stale: true,
      source: 'stale',
      body: { seeded: true },
      resetAt: clock + 600_000,
    });
    expect(result.staleReason).toMatch(/floor/);
  });

  it('still allows a free conditional revalidation below the floor', async () => {
    await seed('"e"');
    await lowLedger(100);
    const { calls, upstream } = recorder(() => response(304, ''));
    const result = await cacheWith(upstream).get('k', 'u', { ttl });
    expect(calls).toHaveLength(1);
    expect(result.source).toBe('revalidated');
  });

  it('makes no call at all once the limit is exhausted', async () => {
    await seed('"e"');
    await lowLedger(0);
    const { calls, upstream } = recorder(() => response(304, ''));
    const result = await cacheWith(upstream).get('k', 'u', { ttl });
    expect(calls).toHaveLength(0);
    expect(result.stale).toBe(true);
  });

  it('throws RateBudgetError with the reset time when nothing is cached', async () => {
    await cacheWith(recorder(() => response(200, {})).upstream).get(
      'seed',
      'u0',
      { ttl }
    );
    await lowLedger(0);
    const { calls, upstream } = recorder(() => response(200, {}));
    const error = await cacheWith(upstream)
      .get('k', 'u', { ttl })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateBudgetError);
    expect((error as RateBudgetError).resetAt).toBe(clock + 600_000);
    expect((error as RateBudgetError).exitCode).toBe(75);
    expect(calls).toHaveLength(0);
  });

  it('records a 403 retry-after block, serves stale, and blocks peers until it passes', async () => {
    await seed('"e"');
    const blocked = recorder(() =>
      response(403, 'secondary', {
        'retry-after': '120',
        'x-ratelimit-remaining': '3000',
      })
    );
    const first = await cacheWith(blocked.upstream).get('k', 'u', { ttl });
    expect(first).toMatchObject({ stale: true, resetAt: clock + 120_000 });
    const ledger = JSON.parse(await readFile(join(dir, 'rate.json'), 'utf8'));
    expect(ledger.blockedUntil).toBe(clock + 120_000);

    const peer = recorder(() => response(304, ''));
    expect((await cacheWith(peer.upstream).get('k', 'u', { ttl })).stale).toBe(
      true
    );
    expect(peer.calls).toHaveLength(0);

    clock += 121_000;
    expect((await cacheWith(peer.upstream).get('k', 'u', { ttl })).source).toBe(
      'revalidated'
    );
    expect(peer.calls).toHaveLength(1);
  });

  it('lets free endpoints through while blocked', async () => {
    await seed();
    await lowLedger(0);
    const { calls, upstream } = recorder(() => response(200, { free: true }));
    const result = await cacheWith(upstream).get('rl', 'u/rate_limit', {
      ttl,
      free: true,
    });
    expect(calls).toHaveLength(1);
    expect(result.source).toBe('fetched');
  });

  it('serves stale data on an upstream 5xx and rethrows when nothing is cached', async () => {
    await seed('"e"');
    const failing = recorder(() => response(502, 'bad gateway'));
    expect(
      (await cacheWith(failing.upstream).get('k', 'u', { ttl })).staleReason
    ).toMatch(/502/);
    await expect(
      cacheWith(failing.upstream).get('missing', 'u2', { ttl })
    ).rejects.toThrow(/HTTP 502/);
  });
});
