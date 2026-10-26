// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), fromEnv: vi.fn() }));
vi.mock('../abuse-guard/select', () => ({
  selectAbuseGuard: (family: string) => mocks.select(family),
}));
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => mocks.fromEnv() },
}));

import {
  getUpstashRestRedisClient,
  withLegacyReplayReads,
} from '../upstash-rest';

describe('getUpstashRestRedisClient family routing', () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.fromEnv.mockReset();
    mocks.fromEnv.mockReturnValue({ scan: () => undefined });
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves an assigned family from the guard store', async () => {
    const client = { get: vi.fn(async () => '1700000000') };
    mocks.select.mockReturnValue({ kind: 'durable-object', client });
    const redis = await getUpstashRestRedisClient({ family: 'replay' });
    await expect(redis?.get('k')).resolves.toBe(1700000000);
    expect(mocks.fromEnv).not.toHaveBeenCalled();
  });

  it('reports a switched-off or misconfigured family as unavailable', async () => {
    mocks.select.mockReturnValue({ kind: 'off' });
    await expect(
      getUpstashRestRedisClient({ family: 'replay' })
    ).resolves.toBeNull();
    expect(mocks.fromEnv).not.toHaveBeenCalled();
  });

  it('keeps Upstash for unassigned families and family-less callers', async () => {
    mocks.select.mockReturnValue({ kind: 'legacy' });
    await expect(
      getUpstashRestRedisClient({ family: 'replay' })
    ).resolves.not.toBeNull();
    await expect(getUpstashRestRedisClient()).resolves.not.toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.fromEnv).toHaveBeenCalledTimes(2);
  });
});

describe('withLegacyReplayReads', () => {
  function views(legacyValue: string | null) {
    const calls = { set: 0 };
    const view = {
      async get<T = unknown>(_key: string): Promise<T | null> {
        return null;
      },
      async set(
        _key: string,
        _value: unknown,
        _options?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
      ): Promise<'OK' | null> {
        calls.set += 1;
        return 'OK';
      },
    };
    const legacy = { get: vi.fn(async (_key: string) => legacyValue) };
    return {
      calls,
      legacy,
      wrapped: withLegacyReplayReads(view, legacy as never),
    };
  }

  it('treats a key consumed in the legacy store as replayed', async () => {
    const { calls, wrapped } = views('1');
    await expect(
      wrapped.set('k', '1', { ex: 60, nx: true })
    ).resolves.toBeNull();
    expect(calls.set).toBe(0);
    await expect(wrapped.get('k')).resolves.toBe('1');
  });

  it('claims in the new store when the legacy store has no record', async () => {
    const { calls, wrapped } = views(null);
    await expect(wrapped.set('k', '1', { ex: 60, nx: true })).resolves.toBe(
      'OK'
    );
    expect(calls.set).toBe(1);
  });

  it('fails like the store when the legacy read fails', async () => {
    const { legacy, wrapped } = views(null);
    legacy.get.mockRejectedValueOnce(new Error('legacy down'));
    await expect(wrapped.set('k', '1', { nx: true })).rejects.toThrow(
      'legacy down'
    );
  });

  it('reads through the legacy store only inside the configured window', async () => {
    const client = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => true),
    };
    mocks.select.mockReturnValue({ kind: 'durable-object', client });
    mocks.fromEnv.mockReturnValue({
      scan: () => undefined,
      get: async () => '1',
    });
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
    vi.stubEnv('ABUSE_GUARD_REPLAY_LEGACY_UNTIL', '2999-01-01T00:00:00Z');
    const redis = await getUpstashRestRedisClient({ family: 'replay' });
    await expect(
      redis?.set('k', '1', { nx: true, ex: 60 })
    ).resolves.toBeNull();
    vi.stubEnv('ABUSE_GUARD_REPLAY_LEGACY_UNTIL', '2000-01-01T00:00:00Z');
    const after = await getUpstashRestRedisClient({ family: 'replay' });
    await expect(after?.set('k', '1', { nx: true, ex: 60 })).resolves.toBe(
      'OK'
    );
    vi.unstubAllEnvs();
  });
});
