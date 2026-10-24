import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { sha256Hex } from './auth';
import { emptyState } from './budget';
import { TurboCacheBudget } from './budget-object';
import type { Env } from './config';
import {
  createBudgetNamespace,
  FakeBucket,
  FakeStorage,
  TOKENS,
  tokenRegistry,
} from './test-fakes';
import { createHandler } from './worker';

const KEY = '_control/budget-v1';
const HASH = '0123456789abcdef';

async function fixture(overrides: Partial<Env> = {}) {
  let clock = new Date('2026-10-23T00:00:00Z');
  const bucket = new FakeBucket(() => clock);
  const storage = new FakeStorage();
  let env: Env;
  const { namespace, counter } = createBudgetNamespace(
    storage,
    () => env,
    () => clock
  );
  env = {
    ARTIFACTS: bucket,
    BUDGET: namespace,
    TURBO_CACHE_MODE: 'read-write',
    TURBO_CACHE_TOKENS: await tokenRegistry(),
    TURBO_CACHE_ADMIN_TOKEN_SHA256: await sha256Hex(TOKENS.admin),
    ...overrides,
  };
  await bucket.put(KEY, JSON.stringify(emptyState(clock)));
  const call = (
    method = 'PUT',
    path = `/v8/artifacts/${HASH}`,
    token = TOKENS.main,
    body = 'x'
  ) =>
    createHandler({ deniedUntil: {}, now: () => clock })(
      new Request(`https://cache.test${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-length': String(body.length),
          'x-artifact-tag': 'c2ln',
        },
        ...(method === 'GET' || method === 'HEAD' ? {} : { body }),
      }),
      env
    );
  return {
    bucket,
    storage,
    env,
    counter,
    call,
    advance: () => {
      clock = new Date(clock.getTime() + 86_400_000);
    },
  };
}

describe('durable admission cost regressions', () => {
  it('stops DO requests and all writes for repeated denials across fresh isolates and DO restarts', async () => {
    const f = await fixture({ TURBO_CACHE_DAILY_CLASS_A: '2' });
    expect((await f.call()).status).toBe(202);
    await f.call();
    await f.call();
    const requests = f.counter.fetches;
    const writes = vi.spyOn(f.bucket, 'put');
    const storageWrites = vi.spyOn(f.storage, 'put');
    for (let i = 0; i < 12; i++) expect((await f.call()).status).toBe(503);
    expect(f.counter.fetches).toBe(requests);
    expect(writes).not.toHaveBeenCalled();
    expect(storageWrites).not.toHaveBeenCalled();
    f.advance();
    expect((await f.call()).status).toBe(202);
  });

  it('does not rewrite durable state when racing admission already exhausted the cap', async () => {
    const f = await fixture();
    const state = {
      ...emptyState(new Date('2026-10-23T00:00:00Z')),
      fence: { tripped: true, reason: 'operator' },
    };
    await f.storage.put('budget', state);
    await f.bucket.put(KEY, JSON.stringify(state));
    const storageWrites = vi.spyOn(f.storage, 'put');
    const puts = f.bucket.ops.put;
    const stub = f.env.BUDGET.get(f.env.BUDGET.idFromName('global'));
    for (let i = 0; i < 10; i++) {
      const response = await stub.fetch('https://budget/admit', {
        method: 'POST',
        body: JSON.stringify({ operation: 'class-a', count: 1, bytes: 1 }),
      });
      expect(await response.json()).toMatchObject({ allowed: false });
    }
    expect(storageWrites).not.toHaveBeenCalled();
    expect(f.bucket.ops.put).toBe(puts);
  });

  it('fails closed without a provisioned durable snapshot, before calling the DO', async () => {
    const f = await fixture();
    f.bucket.objects.delete(KEY);
    expect((await f.call()).status).toBe(503);
    expect(f.counter.fetches).toBe(0);
  });

  it('stops before the DO on persistent snapshot-read failures across fresh isolates', async () => {
    const f = await fixture();
    vi.spyOn(f.bucket, 'get').mockRejectedValue(
      new Error('storage unavailable')
    );
    const writes = vi.spyOn(f.bucket, 'put');
    for (let i = 0; i < 12; i++) expect((await f.call()).status).toBe(503);
    expect(f.counter.fetches).toBe(0);
    expect(writes).not.toHaveBeenCalled();
    expect(f.bucket.ops).toEqual({ get: 0, head: 0, put: 0 });
  });

  it('retains an unknown committed reservation after restart without retrying', async () => {
    const f = await fixture({ TURBO_CACHE_DAILY_CLASS_A: '2' });
    const original = f.bucket.put.bind(f.bucket);
    const writes = vi
      .spyOn(f.bucket, 'put')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (args[0] === KEY) throw new Error('response lost after commit');
        return result;
      });
    expect((await f.call()).status).toBe(503);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(f.counter.fetches).toBe(1);
    for (let i = 0; i < 12; i++) expect((await f.call()).status).toBe(503);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(f.counter.fetches).toBe(1);
    expect(f.bucket.ops.put).toBe(0);
  });

  it('does not retry a failed reservation or grant artifact access', async () => {
    const f = await fixture();
    const writes = vi
      .spyOn(f.bucket, 'put')
      .mockRejectedValue(new Error('unavailable'));
    expect((await f.call()).status).toBe(503);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(f.counter.fetches).toBe(1);
    expect(f.bucket.ops.put).toBe(0);
  });

  it('serializes racing external reads and coalesces repeated stop/reset mutations', async () => {
    const f = await fixture({ TURBO_CACHE_DAILY_CLASS_A: '2' });
    const object = new TurboCacheBudget(
      {},
      f.env,
      () => new Date('2026-10-23T00:00:00Z')
    );
    const writes = vi.spyOn(f.bucket, 'put');
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        object.fetch(
          new Request('https://budget/admit', {
            method: 'POST',
            body: JSON.stringify({ operation: 'class-a', count: 1, bytes: 1 }),
          })
        )
      )
    );
    const results = await Promise.all(
      responses.map((response) => response.json())
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(writes).toHaveBeenCalledTimes(1);
    for (const action of ['trip', 'trip', 'trip', 'reset', 'reset', 'reset']) {
      expect(
        (
          await f.call(
            'POST',
            '/admin/fence',
            TOKENS.admin,
            JSON.stringify({ action })
          )
        ).status
      ).toBe(200);
    }
    expect(writes).toHaveBeenCalledTimes(3);
  });

  it('fits the largest permitted batch into the configured subrequest envelope', async () => {
    const f = await fixture();
    f.env.TURBO_CACHE_TOKENS = JSON.stringify([
      {
        id: 'ci-main',
        sha256: await sha256Hex(TOKENS.main),
        read: ['a', 'b', 'c', 'd'],
      },
    ]);
    const config = readFileSync(
      new URL('../cloudflare.config.ts', import.meta.url),
      'utf8'
    );
    const limit = Number(/subrequests: (\d+)/.exec(config)?.[1]);
    const before = { ...f.bucket.ops };
    const controlBefore = { ...f.bucket.controlOps };
    const hashes = Array.from({ length: 50 }, (_, i) =>
      i.toString(16).padStart(16, '0')
    );
    const response = await f.call(
      'POST',
      '/v8/artifacts',
      TOKENS.main,
      JSON.stringify({ hashes })
    );
    expect(response.status).toBe(200);
    expect(f.bucket.ops.head - before.head).toBe(200);
    const r2 =
      f.bucket.ops.get -
      before.get +
      f.bucket.ops.head -
      before.head +
      f.bucket.ops.put -
      before.put;
    // Include the DO request and rate limiter as well as all nested R2 work.
    const control =
      f.bucket.controlOps.get -
      controlBefore.get +
      f.bucket.controlOps.put -
      controlBefore.put;
    expect(r2 + control + f.counter.fetches + 1).toBe(205);
    expect(r2 + control + f.counter.fetches + 1).toBeLessThanOrEqual(limit);
  });
});
