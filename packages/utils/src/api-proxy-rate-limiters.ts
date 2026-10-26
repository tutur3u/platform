/**
 * Route rate limiters for the API proxy guard. The `proxy` family uses the
 * Durable Object guard store when assigned, else Upstash; an unavailable store
 * keeps the existing policy of applying no route limits.
 */
import { Ratelimit } from '@upstash/ratelimit';
import type { AbuseGuardClient } from './abuse-guard/client';
import { selectAbuseGuard } from './abuse-guard/select';
import type {
  RateLimitConfig,
  RateLimitProfile,
  RateLimitWindow,
} from './api-proxy-guard';
import {
  getUpstashRatelimitRedisClient,
  type UpstashRatelimitRedisClient,
} from './upstash-rest';

type RateLimitBucket = {
  limiter: RateLimiter;
  window: RateLimitWindow;
};

type Limiters = {
  get: RateLimitBucket[];
  mutate: RateLimitBucket[];
};

export type RateLimitResult = {
  limit: number;
  remaining: number;
  reset: number;
  success: boolean;
};

type RateLimiter = {
  limit: (identifier: string) => Promise<RateLimitResult>;
};

const limiterCache = new Map<string, Limiters>();

export function clearApiProxyGuardLimiterCache() {
  limiterCache.clear();
}

/** Drops a cached limiter set after a store failure. */
export function forgetRateLimiters(cacheKey: string) {
  limiterCache.delete(cacheKey);
}

const RATE_LIMIT_DURATION_MS: Record<RateLimitConfig['duration'], number> = {
  '1 m': 60_000,
  '1 h': 60 * 60_000,
  '1 d': 24 * 60 * 60_000,
};

/**
 * Durable Object buckets: one partition per prefix, kind and caller, with the
 * window and limit in the key so distinct limits never share a window.
 */
function createGuardRateLimitBuckets(
  client: AbuseGuardClient,
  prefixBase: string,
  kind: 'get' | 'mutate',
  configs: RateLimitConfig[]
): RateLimitBucket[] {
  return configs.map((config) => ({
    window: config.window,
    limiter: {
      async limit(identifier) {
        const outcome = await client.hitWindows([
          {
            partition: `${prefixBase}:${kind}:${identifier}`,
            windows: [
              {
                key: `${config.window}:${config.limit}`,
                limit: config.limit,
                windowMs: RATE_LIMIT_DURATION_MS[config.duration],
                algo: 'sliding',
              },
            ],
          },
        ]);
        return {
          success: outcome.ok,
          limit: config.limit,
          remaining: outcome.ok ? outcome.remaining : 0,
          reset: outcome.resetAt,
        };
      },
    },
  }));
}

function createRedisRateLimitBuckets(
  redis: UpstashRatelimitRedisClient,
  prefixBase: string,
  kind: 'get' | 'mutate',
  configs: RateLimitConfig[]
): RateLimitBucket[] {
  return configs.map((config) => ({
    window: config.window,
    limiter: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, config.duration),
      prefix: `${prefixBase}:${kind}:${config.window}`,
      analytics: false,
    }),
  }));
}

export async function getRateLimiters(
  prefixBase: string,
  profile: RateLimitProfile
): Promise<Limiters | null> {
  const cacheKey = `${prefixBase}:${JSON.stringify(profile)}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const selection = selectAbuseGuard('proxy');
  // An unavailable store keeps the existing policy: no route limits.
  if (selection.kind === 'off') return null;
  if (selection.kind === 'durable-object') {
    const limiters = {
      get: createGuardRateLimitBuckets(
        selection.client,
        prefixBase,
        'get',
        profile.get
      ),
      mutate: createGuardRateLimitBuckets(
        selection.client,
        prefixBase,
        'mutate',
        profile.mutate
      ),
    };
    limiterCache.set(cacheKey, limiters);
    return limiters;
  }

  const redis = await getUpstashRatelimitRedisClient().catch(() => null);
  if (!redis) {
    return null;
  }

  const limiters = {
    get: createRedisRateLimitBuckets(redis, prefixBase, 'get', profile.get),
    mutate: createRedisRateLimitBuckets(
      redis,
      prefixBase,
      'mutate',
      profile.mutate
    ),
  };

  limiterCache.set(cacheKey, limiters);
  return limiters;
}
