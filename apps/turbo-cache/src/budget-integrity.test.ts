import { describe, expect, it, vi } from 'vitest';
import { emptyState } from './budget';
import { TurboCacheBudget } from './budget-object';
import { BUDGET_KEY } from './budget-store';
import type { Env } from './config';
import {
  createBudgetNamespace,
  FakeBucket,
  FakeStorage,
  TOKENS,
  tokenRegistry,
} from './test-fakes';
import { createHandler } from './worker';

const now = () => new Date('2026-10-23T00:00:00Z');

function fixture() {
  const bucket = new FakeBucket(now);
  const storage = new FakeStorage();
  const env: Env = {
    ARTIFACTS: bucket,
    BUDGET: {
      idFromName: () => 'global',
      get: () => ({ fetch: async () => new Response() }),
    },
  };
  const restart = () => new TurboCacheBudget({ storage }, env, now);
  let object = restart();
  const call = (path: string, body?: unknown) =>
    object.fetch(
      new Request(`https://budget${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    );
  return {
    bucket,
    storage,
    env,
    call,
    restart: () => {
      object = restart();
    },
  };
}

const reservation = { operation: 'class-a', count: 1, bytes: 5 };

describe('transactional budget authority', () => {
  it('keeps the stop and counters when an unknown legacy PUT commits after trip, including restart', async () => {
    const f = fixture();
    const older = emptyState(now());
    await f.bucket.put(BUDGET_KEY, JSON.stringify(older));
    expect((await f.call('/fence', { action: 'reset' })).status).toBe(200);
    expect(await (await f.call('/admit', reservation)).json()).toMatchObject({
      allowed: true,
    });

    const original = f.bucket.put.bind(f.bucket);
    let delayedCommit: (() => Promise<unknown>) | undefined;
    vi.spyOn(f.bucket, 'put').mockImplementationOnce(async (...args) => {
      delayedCommit = () => original(...args);
      throw new Error('response lost while write remains in flight');
    });
    await expect(
      f.bucket.put(BUDGET_KEY, JSON.stringify(older))
    ).rejects.toThrow('in flight');
    expect((await f.call('/fence', { action: 'trip' })).status).toBe(200);
    expect(delayedCommit).toBeDefined();
    await delayedCommit?.();
    for (let i = 0; i < 2; i++) {
      f.restart();
      expect(await (await f.call('/state')).json()).toMatchObject({
        dailyClassA: 1,
        dailyWriteBytes: 5,
        fence: { tripped: true },
      });
      expect(await (await f.call('/admit', reservation)).json()).toMatchObject({
        allowed: false,
        reason: 'fenced',
      });
    }
  });

  it('admits a 600-request Turbo burst without any R2 control writes even when they would return 429', async () => {
    const f = fixture();
    await f.call('/fence', { action: 'reset' });
    const puts = vi
      .spyOn(f.bucket, 'put')
      .mockRejectedValue(new Error('429 Too Many Requests'));
    const responses = await Promise.all(
      Array.from({ length: 600 }, () => f.call('/admit', reservation))
    );
    for (const response of responses)
      expect(await response.json()).toMatchObject({ allowed: true });
    expect(puts).not.toHaveBeenCalled();
    expect(f.bucket.controlOps).toEqual({ get: 1, head: 0, put: 0 });
    f.restart();
    expect(await (await f.call('/state')).json()).toMatchObject({
      dailyClassA: 600,
      dailyWriteBytes: 3000,
    });
    expect((await f.call('/fence', { action: 'trip' })).status).toBe(200);
    expect(await (await f.call('/admit', reservation)).json()).toMatchObject({
      allowed: false,
      reason: 'fenced',
    });
  });

  it('keeps cache access available during a burst when control PUTs would be rate limited', async () => {
    const f = fixture();
    await f.call('/fence', { action: 'reset' });
    f.env.BUDGET = createBudgetNamespace(f.storage, () => f.env, now).namespace;
    f.env.TURBO_CACHE_MODE = 'read-write';
    f.env.TURBO_CACHE_TOKENS = await tokenRegistry();
    const original = f.bucket.put.bind(f.bucket);
    const puts = vi
      .spyOn(f.bucket, 'put')
      .mockImplementation((key, ...args) => {
        if (key.startsWith('_control/'))
          return Promise.reject(new Error('429 Too Many Requests'));
        return original(key, ...args);
      });
    const handle = createHandler({ deniedUntil: {}, now });
    const responses = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        handle(
          new Request(
            `https://cache.test/v8/artifacts/${index.toString(16).padStart(16, '0')}`,
            {
              method: 'PUT',
              headers: {
                authorization: `Bearer ${TOKENS.main}`,
                'content-length': '1',
                'x-artifact-tag': 'c2ln',
              },
              body: 'x',
            }
          ),
          f.env
        )
      )
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array(100).fill(202)
    );
    expect(puts).toHaveBeenCalledTimes(100);
    expect(f.bucket.controlOps.put).toBe(0);
  });

  it('preserves migrated charges on initialization and never rereads legacy state', async () => {
    const f = fixture();
    await f.bucket.put(
      BUDGET_KEY,
      JSON.stringify({
        ...emptyState(now()),
        dailyClassA: 99,
        monthlyClassA: 99,
      })
    );
    expect((await f.call('/fence', { action: 'trip' })).status).toBe(200);
    vi.spyOn(f.bucket, 'get').mockRejectedValue(new Error('R2 unavailable'));
    expect((await f.call('/fence', { action: 'reset' })).status).toBe(200);
    expect(await (await f.call('/state')).json()).toMatchObject({
      dailyClassA: 99,
      monthlyClassA: 99,
    });
  });

  it('does not initialize or admit when the legacy read is unresolved', async () => {
    const f = fixture();
    vi.spyOn(f.bucket, 'get').mockRejectedValue(new Error('unavailable'));
    expect((await f.call('/fence', { action: 'reset' })).status).toBe(503);
    expect((await f.call('/admit', reservation)).status).toBe(503);
    expect(f.storage.values.size).toBe(0);
  });
});
