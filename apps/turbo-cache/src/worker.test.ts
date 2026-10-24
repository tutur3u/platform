import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from './auth';
import { emptyState } from './budget';
import { BUDGET_KEY } from './budget-store';
import type { Env } from './config';
import {
  createBudgetNamespace,
  FakeBucket,
  FakeLimiter,
  FakeStorage,
  TOKENS,
  tokenRegistry,
} from './test-fakes';
import { createHandler } from './worker';

const HASH = '0123456789abcdef';
const ORIGIN = 'https://turbo-cache.example';
const DAY_MS = 24 * 60 * 60 * 1000;

let clock: Date;
let bucket: FakeBucket;
let storage: FakeStorage;
let env: Env;
let budget: { fetches: number };
let handle: ReturnType<typeof createHandler>;

async function setup(overrides: Partial<Env> = {}) {
  clock = new Date('2026-10-23T00:00:00Z');
  const now = () => clock;
  bucket = new FakeBucket(now);
  storage = new FakeStorage();
  await bucket.put(BUDGET_KEY, JSON.stringify(emptyState(clock)));
  const created = createBudgetNamespace(storage, () => env, now);
  budget = created.counter;
  env = {
    ARTIFACTS: bucket,
    BUDGET: created.namespace,
    TURBO_CACHE_MODE: 'read-write',
    TURBO_CACHE_TOKENS: await tokenRegistry(),
    TURBO_CACHE_ADMIN_TOKEN_SHA256: await sha256Hex(TOKENS.admin),
    ...overrides,
  };
  handle = createHandler({ deniedUntil: {}, now });
}

function call(
  method: string,
  path: string,
  token?: string,
  init: { body?: string; headers?: Record<string, string> } = {}
) {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return handle(
    new Request(`${ORIGIN}${path}`, { method, headers, body: init.body }),
    env
  );
}

function put(
  token: string,
  body = 'artifact-bytes',
  headers: Record<string, string> = {}
) {
  return call('PUT', `/v8/artifacts/${HASH}?slug=ignored`, token, {
    body,
    headers: {
      'content-length': String(new TextEncoder().encode(body).byteLength),
      'x-artifact-tag': 'c2lnbmF0dXJl',
      'x-artifact-duration': '1200',
      ...headers,
    },
  });
}

beforeEach(async () => {
  await setup();
});

describe('default-safe mode', () => {
  it('serves nothing and touches no storage when mode is unset', async () => {
    await setup({ TURBO_CACHE_MODE: undefined });
    expect(
      await (await call('GET', '/v8/artifacts/status', TOKENS.main)).json()
    ).toEqual({
      status: 'disabled',
    });
    expect(
      (await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main)).status
    ).toBe(503);
    expect((await put(TOKENS.main)).status).toBe(503);
    expect(bucket.ops).toEqual({ get: 0, head: 0, put: 0 });
    expect(budget.fetches).toBe(0);
  });

  it('rejects writes in read-only mode', async () => {
    await setup({ TURBO_CACHE_MODE: 'read-only' });
    expect((await put(TOKENS.main)).status).toBe(403);
    expect(bucket.ops.put).toBe(0);
  });
});

describe('authentication and scopes', () => {
  it('rejects missing, short and unknown tokens', async () => {
    expect((await call('GET', `/v8/artifacts/${HASH}`)).status).toBe(401);
    expect((await call('GET', `/v8/artifacts/${HASH}`, 'short')).status).toBe(
      401
    );
    expect(
      (await call('GET', `/v8/artifacts/${HASH}`, `${TOKENS.main}x`)).status
    ).toBe(401);
    expect(budget.fetches).toBe(0);
  });

  it('fails closed when one registry entry is malformed', async () => {
    const entries = JSON.parse(await tokenRegistry());
    entries.push({ id: 'bad', sha256: 'nothex', read: ['main'] });
    await setup({ TURBO_CACHE_TOKENS: JSON.stringify(entries) });
    expect(
      (await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main)).status
    ).toBe(401);
  });

  it('never lets a read-only token write', async () => {
    const response = await put(TOKENS.readonly);
    expect(response.status).toBe(403);
    expect(bucket.ops.put).toBe(0);
    expect(budget.fetches).toBe(0);
  });

  it('round-trips a signed artifact with its tag and duration', async () => {
    expect((await put(TOKENS.main)).status).toBe(202);
    const response = await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-artifact-tag')).toBe('c2lnbmF0dXJl');
    expect(response.headers.get('x-artifact-duration')).toBe('1200');
    expect(await response.text()).toBe('artifact-bytes');
  });

  it('lets branches reuse main artifacts but keeps branch writes away from main', async () => {
    await put(TOKENS.main, 'from-main');
    expect(
      await (await call('GET', `/v8/artifacts/${HASH}`, TOKENS.branch)).text()
    ).toBe('from-main');
    const other = 'fedcba9876543210';
    await call('PUT', `/v8/artifacts/${other}`, TOKENS.branch, {
      body: 'poison',
      headers: { 'content-length': '6', 'x-artifact-tag': 'dGFn' },
    });
    expect(bucket.objects.has(`v1/branch/${other}`)).toBe(true);
    expect(
      (await call('GET', `/v8/artifacts/${other}`, TOKENS.main)).status
    ).toBe(404);
    expect(
      (await call('GET', `/v8/artifacts/${other}`, TOKENS.readonly)).status
    ).toBe(404);
  });

  it('rejects malformed hashes before any billable work', async () => {
    for (const hash of ['..%2Fsecret', 'ZZZZ', 'abc']) {
      expect(
        (await call('GET', `/v8/artifacts/${hash}`, TOKENS.main)).status
      ).toBe(400);
    }
    expect(budget.fetches).toBe(0);
    expect(bucket.ops).toEqual({ get: 0, head: 0, put: 0 });
  });
});

describe('upload bounds', () => {
  it('requires a length, a signature tag and the size ceiling', async () => {
    await setup({ TURBO_CACHE_MAX_ARTIFACT_BYTES: '8' });
    expect((await put(TOKENS.main, 'x', { 'content-length': '' })).status).toBe(
      411
    );
    expect((await put(TOKENS.main, 'x', { 'x-artifact-tag': '' })).status).toBe(
      400
    );
    expect((await put(TOKENS.main, '123456789')).status).toBe(413);
    expect(bucket.ops.put).toBe(0);
    expect(budget.fetches).toBe(0);
  });

  it('accepts unsigned artifacts only when signatures are explicitly optional', async () => {
    await setup({ TURBO_CACHE_REQUIRE_SIGNATURE: 'false' });
    expect((await put(TOKENS.main, 'x', { 'x-artifact-tag': '' })).status).toBe(
      202
    );
  });

  it('treats artifacts older than the TTL as misses', async () => {
    await setup({ TURBO_CACHE_TTL_DAYS: '2' });
    await put(TOKENS.main);
    clock = new Date(clock.getTime() + 3 * DAY_MS);
    expect(
      (await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main)).status
    ).toBe(404);
    expect(
      (await call('HEAD', `/v8/artifacts/${HASH}`, TOKENS.main)).status
    ).toBe(404);
  });
});

describe('operation accounting', () => {
  it('costs exactly one R2 op and one admission per hit, miss and write', async () => {
    await put(TOKENS.main);
    expect(bucket.ops).toEqual({ get: 0, head: 0, put: 1 });
    expect(budget.fetches).toBe(1);
    await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main);
    await call('GET', '/v8/artifacts/1111111111111111', TOKENS.main);
    expect(bucket.ops).toEqual({ get: 2, head: 0, put: 1 });
    expect(budget.fetches).toBe(3);
    // Branch tokens reserve both scope lookups in a single admission.
    await call('GET', '/v8/artifacts/1111111111111111', TOKENS.branch);
    expect(bucket.ops.get).toBe(4);
    expect(budget.fetches).toBe(4);
    expect(bucket.controlOps).toEqual({ get: 8, head: 0, put: 5 });
    expect(storage.values.size).toBe(0);
  });

  it('answers events and status without artifact or admission operations', async () => {
    await call('POST', '/v8/artifacts/events', TOKENS.main, { body: '[]' });
    await call('GET', '/v8/artifacts/status', TOKENS.main);
    expect(bucket.controlOps).toEqual({ get: 1, head: 0, put: 1 });
    expect(bucket.ops).toEqual({ get: 0, head: 0, put: 0 });
    expect(budget.fetches).toBe(0);
  });

  it('bounds batch queries', async () => {
    const hashes = Array.from({ length: 51 }, (_, i) =>
      i.toString(16).padStart(16, '0')
    );
    const tooMany = await call('POST', '/v8/artifacts', TOKENS.main, {
      body: JSON.stringify({ hashes }),
    });
    expect(tooMany.status).toBe(400);
    await put(TOKENS.main);
    const ok = await call('POST', '/v8/artifacts', TOKENS.main, {
      body: JSON.stringify({ hashes: [HASH, '2222222222222222'] }),
    });
    expect(await ok.json()).toEqual({
      [HASH]: { size: 14, taskDurationMs: 1200, tag: 'c2lnbmF0dXJl' },
      '2222222222222222': null,
    });
    expect(bucket.ops.head).toBe(2);
  });

  it('rate limits per token before any admission or storage work', async () => {
    env.REQUEST_LIMITER = new FakeLimiter(1);
    expect(
      (await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main)).status
    ).toBe(404);
    expect(
      (await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main)).status
    ).toBe(429);
    expect(bucket.ops.get).toBe(1);
    expect(budget.fetches).toBe(1);
  });
});

describe('durable stop fence', () => {
  it('pauses writes at the daily cap and resumes the next UTC day', async () => {
    await setup({ TURBO_CACHE_DAILY_CLASS_A: '2' });
    expect((await put(TOKENS.main)).status).toBe(202);
    const denied = await put(TOKENS.main);
    expect(denied.status).toBe(503);
    expect(denied.headers.get('x-turbo-cache-denied')).toBe('daily-class-a');
    expect(bucket.ops.put).toBe(1);
    // The isolate memo skips the Durable Object while paused.
    await put(TOKENS.main);
    expect(budget.fetches).toBe(1);
    expect(
      await (await call('GET', '/v8/artifacts/status', TOKENS.main)).json()
    ).toEqual({
      status: 'paused',
    });
    clock = new Date(clock.getTime() + DAY_MS);
    expect((await put(TOKENS.main)).status).toBe(202);
  });

  it('trips a fence at the monthly cap that survives restarts until an operator reset', async () => {
    await setup({ TURBO_CACHE_MONTHLY_CLASS_A_FENCE: '2' });
    clock = new Date('2026-10-31T23:59:00Z');
    expect((await put(TOKENS.main)).status).toBe(202);
    expect((await put(TOKENS.main)).headers.get('x-turbo-cache-denied')).toBe(
      'fenced'
    );
    // New day, new isolate, new Durable Object instance: still fenced.
    clock = new Date('2026-11-01T00:00:00Z');
    handle = createHandler({ deniedUntil: {}, now: () => clock });
    const fencedRead = await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main);
    expect(fencedRead.headers.get('x-turbo-cache-denied')).toBe('fenced');
    expect(bucket.ops.get).toBe(0);

    expect(
      (
        await call('POST', '/admin/fence', TOKENS.main, {
          body: '{"action":"reset"}',
        })
      ).status
    ).toBe(401);
    const reset = await call('POST', '/admin/fence', TOKENS.admin, {
      body: '{"action":"reset"}',
    });
    expect((await reset.json()).fence).toEqual({ tripped: false });
    handle = createHandler({ deniedUntil: {}, now: () => clock });
    expect(
      (await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main)).status
    ).toBe(200);
  });

  it('lets an operator trip the fence immediately', async () => {
    await call('POST', '/admin/fence', TOKENS.admin, {
      body: '{"action":"trip"}',
    });
    const response = await put(TOKENS.main);
    expect(response.headers.get('x-turbo-cache-denied')).toBe('fenced');
    expect(bucket.ops.put).toBe(0);
  });

  it('treats an unavailable budget object as a pause, never as an allowance', async () => {
    env.BUDGET = {
      idFromName: () => 'global',
      get: () => ({ fetch: async () => new Response('boom', { status: 500 }) }),
    };
    expect((await put(TOKENS.main)).status).toBe(503);
    expect(
      (await call('GET', `/v8/artifacts/${HASH}`, TOKENS.main)).status
    ).toBe(404);
    expect(bucket.ops).toEqual({ get: 0, head: 0, put: 0 });
  });
});
