import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const upstash = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: async () => upstash.client,
}));

import {
  COMPLETE_CLAIM_SCRIPT,
  RELEASE_CLAIM_SCRIPT,
} from './push-events/claims';
import {
  getMastermindPushRedis,
  getMastermindStore,
  mastermindPushRedis,
  upstashMastermindStore,
} from './store';

const TOKEN = 'store-token-'.padEnd(40, 't');

describe('Mastermind store resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    upstash.client = null;
  });

  it('prefers the Cloudflare store, then Upstash, then nothing', async () => {
    upstash.client = { get: vi.fn(), eval: vi.fn() };
    vi.stubEnv('MASTERMIND_STORE_URL', 'https://mastermind-store.example.com');
    vi.stubEnv('MASTERMIND_STORE_TOKEN', TOKEN);
    expect(await getMastermindPushRedis()).not.toBe(upstash.client);
    expect(await getMastermindStore()).not.toBeNull();

    vi.stubEnv('MASTERMIND_STORE_URL', '');
    expect(await getMastermindPushRedis()).toBe(upstash.client);
    expect(await getMastermindStore()).not.toBeNull();

    upstash.client = null;
    expect(await getMastermindPushRedis()).toBeNull();
    expect(await getMastermindStore()).toBeNull();
  });

  it('refuses a cleartext or short-token store configuration', async () => {
    vi.stubEnv('MASTERMIND_STORE_URL', 'http://mastermind-store.example.com');
    vi.stubEnv('MASTERMIND_STORE_TOKEN', TOKEN);
    expect(await getMastermindStore()).toBeNull();
    vi.stubEnv('MASTERMIND_STORE_URL', 'https://mastermind-store.example.com');
    vi.stubEnv('MASTERMIND_STORE_TOKEN', 'short');
    expect(await getMastermindStore()).toBeNull();
  });
});

describe('push-event claims over the Mastermind store', () => {
  it('keeps NX, release and complete semantics', async () => {
    const redis = mastermindPushRedis(createMemoryMastermindStore());
    expect(await redis.set('claim', 'pending:a', { ex: 120, nx: true })).toBe(
      'OK'
    );
    expect(await redis.set('claim', 'pending:b', { ex: 120, nx: true })).toBe(
      null
    );
    // A stale token neither releases nor completes the claim.
    expect(
      await redis.eval(RELEASE_CLAIM_SCRIPT, ['claim'], ['pending:b'])
    ).toBe(0);
    expect(
      await redis.eval(
        COMPLETE_CLAIM_SCRIPT,
        ['claim'],
        ['pending:b', 'done', 60]
      )
    ).toBe(0);
    expect(
      await redis.eval(
        COMPLETE_CLAIM_SCRIPT,
        ['claim'],
        ['pending:a', 'done', 60]
      )
    ).toBe(1);
    expect(await redis.get('claim')).toBe('done');
    expect(await redis.eval(RELEASE_CLAIM_SCRIPT, ['claim'], ['done'])).toBe(1);
    expect(await redis.get('claim')).toBeNull();
  });

  it('refuses any other script', async () => {
    const redis = mastermindPushRedis(createMemoryMastermindStore());
    await expect(redis.eval('return 1', ['k'], [])).rejects.toThrow(
      'Unsupported'
    );
  });
});

describe('legacy Upstash adapter', () => {
  it('maps the store ops onto Redis commands', async () => {
    const client = {
      get: vi.fn(async () => ({ parsed: true })),
      mget: vi.fn(async () => ['a', null]),
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async () => 1),
      del: vi.fn(async () => 1),
    };
    const store = upstashMastermindStore(client as never);
    // Upstash auto-parses JSON; the adapter hands back text.
    expect(await store.get('k')).toBe('{"parsed":true}');
    expect(await store.mget(['a', 'b'])).toEqual(['a', null]);
    expect(await store.set('k', 'v', { ttlMs: 5000, nx: true })).toBe(true);
    expect(client.set).toHaveBeenCalledWith('k', 'v', { px: 5000, nx: true });
    expect(await store.compareAndSet('k', null, 'v', 5000)).toBe(true);
    expect(client.eval).toHaveBeenLastCalledWith(
      expect.stringContaining("ARGV[1] == '0'"),
      ['k'],
      ['0', '', 'v', 5000]
    );
    expect(await store.compareAndDelete('k', 'v')).toBe(true);
    expect(await store.del('k')).toBe(true);
  });
});
