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

afterEach(() => vi.unstubAllEnvs());
it('bounds every provider dispatch with a durable stop fence, daily budget and rollover', async () => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'monitor');
  vi.stubEnv('NATIVE_INTEGRITY_PROVIDER_BUDGET_DAY', '2');
  let clock = now;
  const network = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ success: true }));
  const dispatch = budgetedNativeIntegrityFetch(client, network, () => clock);
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
    budgetedNativeIntegrityFetch(unavailable, network)(
      'https://oauth2.googleapis.com/token',
      { method: 'POST' }
    )
  ).rejects.toThrow('outage');
  expect(network).not.toHaveBeenCalled();
});
