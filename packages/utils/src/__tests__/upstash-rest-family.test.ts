// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), fromEnv: vi.fn() }));
vi.mock('../abuse-guard/select', () => ({
  selectAbuseGuard: (family: string) => mocks.select(family),
}));
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => mocks.fromEnv() },
}));

import { getUpstashRestRedisClient } from '../upstash-rest';

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
