// @vitest-environment node

import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { nativeIntegrityRuntime } from './runtime';

const runtimeMocks = vi.hoisted(() => ({ configuredRedis: vi.fn() }));
vi.mock('./store', async (original) => ({
  ...(await original<object>()),
  configuredNativeIntegrityRedis: runtimeMocks.configuredRedis,
}));

import { budgetedNativeIntegrityFetch } from './provider-budget';
import {
  createNativeIntegrityStore,
  type NativeIntegrityRedisAdapter,
  revokeNativeIntegrityActorKeys,
} from './store';

const execute = promisify(execFile);
let process: ChildProcess;
let scratch: string;
let client: NativeIntegrityRedisAdapter;
const now = 1_800_000_000_000;
const challenge = (id: string) => ({
  id,
  actorId: 'actor',
  method: 'GET' as const,
  path: '/api/v1/users/calendar-settings',
  bodyHash: 'hash',
  purpose: 'request' as const,
  requestHash: 'request-hash',
  expiresAt: now + 120_000,
});
const key = {
  actorId: 'actor',
  publicKey: 'public-key',
  counter: 0,
  environment: 'production' as const,
  platform: 'ios' as const,
};

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'native-integrity-redis-'));
  const socket = join(scratch, 'redis.sock');
  process = spawn(
    'redis-server',
    [
      '--port',
      '0',
      '--unixsocket',
      socket,
      '--unixsocketperm',
      '700',
      '--save',
      '',
      '--appendonly',
      'no',
      '--dir',
      scratch,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error('Redis fixture startup timed out')),
      4000
    );
    process.once('error', reject);
    process.stdout?.on('data', (chunk: Buffer) => {
      if (
        chunk.toString().toLowerCase().includes('ready to accept connections')
      ) {
        clearTimeout(deadline);
        resolve();
      }
    });
    process.once('exit', () =>
      reject(new Error('Redis fixture exited before ready'))
    );
  });
  const command = async (args: string[]) => {
    const result = await execute(
      'redis-cli',
      ['-s', socket, '--json', ...args],
      { timeout: 4000, maxBuffer: 32768 }
    );
    return JSON.parse(result.stdout);
  };
  client = {
    eval: (script, keys, args) =>
      command([
        'EVAL',
        script,
        String(keys.length),
        ...keys,
        ...args.map(String),
      ]),
    get: (name) => command(['GET', name]),
  };
});
afterAll(async () => {
  if (process && process.exitCode === null) {
    const closed = new Promise<void>((resolve) =>
      process.once('exit', () => resolve())
    );
    process.kill('SIGTERM');
    await closed;
  }
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

describe('native integrity atomic Redis operations', () => {
  it('enforces issuance quota and atomically consumes each nonce once under a race', async () => {
    const store = createNativeIntegrityStore(client, () => now);
    expect(
      await store.issueChallenge(challenge('one'), {
        limit: 2,
        windowSeconds: 60,
      })
    ).toBe(true);
    expect(
      await store.issueChallenge(challenge('two'), {
        limit: 2,
        windowSeconds: 60,
      })
    ).toBe(true);
    expect(
      await store.issueChallenge(challenge('three'), {
        limit: 2,
        windowSeconds: 60,
      })
    ).toBe(false);
    const outcomes = await Promise.all([
      store.consumeChallenge('one'),
      store.consumeChallenge('one'),
    ]);
    expect(outcomes.filter(Boolean)).toEqual([challenge('one')]);
    expect(outcomes.filter((value) => value === null)).toHaveLength(1);
    expect(
      await store.issueChallenge(
        { ...challenge('expired'), actorId: 'other', expiresAt: now },
        { limit: 2, windowSeconds: 60 }
      )
    ).toBe(false);
  });
  it('registers once, enforces counter CAS without resetting TTL, isolates actors and revokes bounded keys', async () => {
    const store = createNativeIntegrityStore(client, () => now);
    expect(await store.registerKey('actor', 'key', key)).toBe(true);
    expect(await store.registerKey('actor', 'key', key)).toBe(false);
    expect(await store.getKey('other', 'key')).toBeNull();
    expect(
      await store.registerKey('other', 'key', { ...key, actorId: 'other' })
    ).toBe(false);
    const counters = await Promise.all([
      store.advanceCounter('actor', 'key', 0, 1),
      store.advanceCounter('actor', 'key', 0, 2),
    ]);
    expect(counters.filter(Boolean)).toHaveLength(1);
    const storedKey = `native-integrity:v1:key:${createHash('sha256').update('actor\nkey').digest('hex')}`;
    const ttl = await client.eval(
      "return redis.call('PTTL', KEYS[1])",
      [storedKey],
      []
    );
    expect(ttl).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(90 * 24 * 60 * 60 * 1000);
    const enrolled = await store.getKey('actor', 'key');
    expect(enrolled?.counter).toBeGreaterThan(0);
    expect(await store.advanceCounter('actor', 'key', 0, 99)).toBe(false);
    expect(await revokeNativeIntegrityActorKeys(client, 'actor')).toBe(1);
    expect(await store.getKey('actor', 'key')).toBeNull();
  });
  it('atomically caps active enrolled keys at eight', async () => {
    const store = createNativeIntegrityStore(client, () => now);
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.registerKey('capped', `cap-${i}`, { ...key, actorId: 'capped' })
      )
    );
    expect(attempts.filter(Boolean)).toHaveLength(8);
    expect(await revokeNativeIntegrityActorKeys(client, 'capped')).toBe(8);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('bounds every provider dispatch with a durable stop fence, daily budget and rollover', async () => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'monitor');
  vi.stubEnv('NATIVE_INTEGRITY_PROVIDER_BUDGET_DAY', '20');
  vi.stubEnv('NATIVE_INTEGRITY_PROVIDER_BUDGET_ACTOR_DAY', '2');
  let clock = now;
  const network = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ success: true }));
  const dispatch = budgetedNativeIntegrityFetch(
    client,
    'budget-actor',
    network,
    () => clock
  );
  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  await dispatch(url, { method: 'POST' });
  await dispatch(url, { method: 'POST' });
  await expect(dispatch(url, { method: 'POST' })).rejects.toThrow(
    'budget exhausted'
  );
  expect(network).toHaveBeenCalledTimes(2);
  clock += 86_400_000;
  await dispatch(url, { method: 'POST' });
  await client.eval(
    "return redis.call('SET', KEYS[1], '1')",
    ['native-integrity:v1:provider-stop'],
    []
  );
  await expect(dispatch(url, { method: 'POST' })).rejects.toThrow(
    'budget exhausted'
  );
  expect(network).toHaveBeenCalledTimes(3);
  await client.eval(
    "return redis.call('DEL', KEYS[1])",
    ['native-integrity:v1:provider-stop'],
    []
  );
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'off');
  await expect(dispatch(url, { method: 'POST' })).rejects.toThrow(
    'dispatch disabled'
  );
  expect(network).toHaveBeenCalledTimes(3);
});
it('fails closed before provider network when budget storage is unavailable', async () => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'monitor');
  const network = vi.fn<typeof fetch>();
  const unavailable: NativeIntegrityRedisAdapter = {
    eval: async () => {
      throw new Error('outage');
    },
    get: async () => null,
  };
  await expect(
    budgetedNativeIntegrityFetch(
      unavailable,
      'unavailable-actor',
      network
    )('https://oauth2.googleapis.com/token', { method: 'POST' })
  ).rejects.toThrow('outage');
  expect(network).not.toHaveBeenCalled();
});
it('isolates per-actor provider budgets and emits one scalar warning before global exhaustion', async () => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'monitor');
  vi.stubEnv('NATIVE_INTEGRITY_PROVIDER_BUDGET_DAY', '20');
  vi.stubEnv('NATIVE_INTEGRITY_PROVIDER_BUDGET_ACTOR_DAY', '2');
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const network = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ success: true }));
  const clock = now + 2 * 86_400_000;
  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  const abusive = budgetedNativeIntegrityFetch(
    client,
    'limited-actor',
    network,
    () => clock
  );
  await abusive(url, { method: 'POST' });
  await abusive(url, { method: 'POST' });
  await expect(abusive(url, { method: 'POST' })).rejects.toThrow(
    'budget exhausted'
  );
  expect(network).toHaveBeenCalledTimes(2);
  const day = new Date(clock).toISOString().slice(0, 10);
  await client.eval(
    "return redis.call('SET', KEYS[1], '15')",
    [`native-integrity:v1:provider-budget:${day}`],
    []
  );
  const other = budgetedNativeIntegrityFetch(
    client,
    'other-actor',
    network,
    () => clock
  );
  await other(url, { method: 'POST' });
  await other(url, { method: 'POST' });
  expect(network).toHaveBeenCalledTimes(4);
  expect(warning).toHaveBeenCalledExactlyOnceWith(
    'native-integrity-provider-budget',
    { mode: 'monitor', limit: 20, used: 16, remaining: 4 }
  );
});
it('uses actual runtime configuration: fallback is off by default and only an explicitly eligible unsupported actor can use it', async () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'enforce');
  vi.stubEnv('NATIVE_INTEGRITY_PROVIDER_BUDGET_DAY', '1000');
  vi.stubEnv('NATIVE_INTEGRITY_TURNSTILE_ENABLED', '');
  vi.stubEnv('NATIVE_INTEGRITY_UNSUPPORTED_PLATFORM_ACTOR_IDS', actorId);
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key');
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'synthetic-test-secret');
  runtimeMocks.configuredRedis.mockReturnValue(client);
  const network = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', network);
  const binding = {
    actorId,
    method: 'GET' as const,
    path: '/api/v1/users/calendar-settings',
    bodyHash: createHash('sha256').update('request-body').digest('base64url'),
  };
  let runtime = nativeIntegrityRuntime(actorId);
  const disabled = await runtime?.issue({ ...binding, purpose: 'request' });
  expect(disabled).not.toHaveProperty('turnstileUrl');
  if (!disabled || disabled.mode === 'off')
    throw new Error('Expected enabled runtime');
  expect(
    await runtime?.verify({
      ...binding,
      mechanism: 'turnstile',
      proof: { challengeId: disabled.challengeId, token: 'token' },
    })
  ).toMatchObject({ allowed: false });
  expect(network).not.toHaveBeenCalled();
  vi.stubEnv('NATIVE_INTEGRITY_TURNSTILE_ENABLED', 'true');
  vi.stubEnv('NATIVE_INTEGRITY_UNSUPPORTED_PLATFORM_ACTOR_IDS', '');
  runtime = nativeIntegrityRuntime(actorId);
  const ineligible = await runtime?.issue({ ...binding, purpose: 'request' });
  expect(ineligible).not.toHaveProperty('turnstileUrl');
  if (!ineligible || ineligible.mode === 'off')
    throw new Error('Expected enabled runtime');
  expect(
    await runtime?.verify({
      ...binding,
      mechanism: 'turnstile',
      proof: { challengeId: ineligible.challengeId, token: 'token' },
    })
  ).toMatchObject({ allowed: false });
  expect(network).not.toHaveBeenCalled();
  vi.stubEnv('NATIVE_INTEGRITY_UNSUPPORTED_PLATFORM_ACTOR_IDS', actorId);
  runtime = nativeIntegrityRuntime(actorId);
  const issued = await runtime?.issue({ ...binding, purpose: 'request' });
  if (!issued || issued.mode === 'off')
    throw new Error('Expected enabled runtime');
  expect(issued).toHaveProperty('turnstileUrl');
  network.mockResolvedValueOnce(
    Response.json({
      success: true,
      hostname: 'tuturuuu.com',
      action: 'native_integrity',
      cdata: issued.requestHash,
    })
  );
  expect(
    await runtime?.verify({
      ...binding,
      mechanism: 'turnstile',
      proof: { challengeId: issued.challengeId, token: 'token' },
    })
  ).toMatchObject({ allowed: true, reason: 'verified' });
  expect(network).toHaveBeenCalledTimes(1);
  expect(() =>
    runtime?.verify({
      ...binding,
      actorId: 'other-actor',
      mechanism: 'turnstile',
    })
  ).toThrow('actor mismatch');
});
it('refuses runtime Turnstile downgrade after Apple enrollment or successful Play capability, even for an eligible actor', async () => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'enforce');
  vi.stubEnv('NATIVE_INTEGRITY_TURNSTILE_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key');
  runtimeMocks.configuredRedis.mockReturnValue(client);
  const network = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', network);
  const store = createNativeIntegrityStore(client);
  const actors: { actorId: string; native: 'apple' | 'play' }[] = [
    { actorId: '22222222-2222-4222-8222-222222222222', native: 'apple' },
    { actorId: '33333333-3333-4333-8333-333333333333', native: 'play' },
  ];
  for (const { actorId, native } of actors) {
    if (native === 'apple')
      expect(
        await store.registerKey(actorId, 'native-key', { ...key, actorId })
      ).toBe(true);
    else await store.recordVerifiedPlayCapability(actorId);
    vi.stubEnv('NATIVE_INTEGRITY_UNSUPPORTED_PLATFORM_ACTOR_IDS', actorId);
    const runtime = nativeIntegrityRuntime(actorId);
    const binding = {
      actorId,
      method: 'GET' as const,
      path: '/api/v1/users/calendar-settings',
      bodyHash: createHash('sha256').update('request-body').digest('base64url'),
    };
    const issued = await runtime?.issue({ ...binding, purpose: 'request' });
    if (!issued || issued.mode === 'off')
      throw new Error('Expected enabled runtime');
    expect(issued).not.toHaveProperty('turnstileUrl');
    expect(
      await runtime?.verify({
        ...binding,
        mechanism: 'turnstile',
        proof: { challengeId: issued.challengeId, token: 'token' },
      })
    ).toMatchObject({ allowed: false });
    expect(network).not.toHaveBeenCalled();
  }
});
it('rejects malformed capability state and unsuccessful Play marker persistence', async () => {
  const malformed: NativeIntegrityRedisAdapter = {
    eval: async () => 'unexpected',
    get: async () => null,
  };
  const store = createNativeIntegrityStore(malformed);
  await expect(store.hasNativeCapability('actor')).rejects.toThrow();
  await expect(store.recordVerifiedPlayCapability('actor')).rejects.toThrow(
    'persistence unavailable'
  );
});
it('expires and revokes the bounded Play capability marker independently of Apple keys', async () => {
  const store = createNativeIntegrityStore(client);
  const actor = 'play-retention-actor';
  expect(await store.hasNativeCapability(actor)).toBe(false);
  await store.recordVerifiedPlayCapability(actor);
  expect(await store.hasNativeCapability(actor)).toBe(true);
  const marker = `native-integrity:v1:play-capability:${createHash('sha256').update(actor).digest('hex')}`;
  expect(
    await client.eval("return redis.call('TTL', KEYS[1])", [marker], [])
  ).toBeGreaterThan(89 * 24 * 60 * 60);
  expect(await revokeNativeIntegrityActorKeys(client, actor)).toBe(1);
  expect(await store.hasNativeCapability(actor)).toBe(false);
  await client.eval(
    "return redis.call('SET', KEYS[1], 'malformed')",
    [marker],
    []
  );
  await expect(store.hasNativeCapability(actor)).rejects.toThrow();
  await revokeNativeIntegrityActorKeys(client, actor);
});
it('fails closed on a one-call global budget that cannot provide a pre-exhaustion alert', async () => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'monitor');
  vi.stubEnv('NATIVE_INTEGRITY_PROVIDER_BUDGET_DAY', '1');
  const network = vi.fn<typeof fetch>();
  await expect(
    budgetedNativeIntegrityFetch(
      client,
      'actor',
      network
    )('https://oauth2.googleapis.com/token', { method: 'POST' })
  ).rejects.toThrow('dispatch disabled');
  expect(network).not.toHaveBeenCalled();
});
