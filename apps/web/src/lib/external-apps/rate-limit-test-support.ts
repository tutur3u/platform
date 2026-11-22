import { afterEach, beforeEach, vi } from 'vitest';
import type { RateLimitConfig } from '@/lib/rate-limit';
import { EXTERNAL_APP_RATE_LIMITS } from './rate-limit-policy';

/** An in-memory stand-in for the counter store, recording every count. */
const store = vi.hoisted(() => ({
  calls: [] as string[],
  counts: new Map<string, number>(),
  down: false,
  guardAssigned: true,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitRedis: async (
    key: string,
    config: RateLimitConfig,
    options: { failClosed?: boolean } = {}
  ) => {
    store.calls.push(key);
    const reset = Math.floor(Date.now() / 1000) + config.windowMs / 1000;
    if (store.down) {
      return {
        allowed: !options.failClosed,
        limit: config.maxRequests,
        remaining: 0,
        reset,
        unavailable: true,
      };
    }
    const count = (store.counts.get(key) ?? 0) + 1;
    store.counts.set(key, count);
    return {
      allowed: count <= config.maxRequests,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      reset,
    };
  },
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

vi.mock('@tuturuuu/utils/abuse-guard/select', () => ({
  isAbuseGuardFamilyAssigned: (family: string) =>
    family === 'ratelimit' && store.guardAssigned,
}));

vi.mock('@tuturuuu/utils/upstash-rest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/utils/upstash-rest')>()),
  hasUpstashRestEnv: () => false,
}));

/** Puts a counter at its limit, so the next count is refused. */
export function fill(
  key: string,
  bucket: keyof typeof EXTERNAL_APP_RATE_LIMITS
) {
  store.counts.set(
    `external-app:${bucket}:${key}`,
    EXTERNAL_APP_RATE_LIMITS[bucket].maxRequests
  );
}

export function registerRateLimitStore() {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    store.calls.length = 0;
    store.counts.clear();
    store.down = false;
    store.guardAssigned = true;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
}

export { store };
