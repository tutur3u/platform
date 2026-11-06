/**
 * Route rate limiters for the API proxy guard. The `proxy` family uses the
 * Durable Object guard store when assigned, else Upstash; an unavailable store
 * keeps the existing policy of applying no route limits.
 */
import { Ratelimit } from '@upstash/ratelimit';
import type { AbuseGuardClient } from './abuse-guard/client';
import {
  createExpiringMap,
  createLocalWindowLimiter,
} from './abuse-guard/local-cache';
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
  /** The window that decided the result, when one limiter covers several. */
  window?: RateLimitWindow;
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

/** Denials remembered per instance until their window resets. */
const guardDenials = createExpiringMap<{
  window: RateLimitWindow;
  limit: number;
  reset: number;
}>();
/** Per-instance limits applied while the store is erroring or stopped. */
const outageLimiter = createLocalWindowLimiter();
let nextOutageWarningAt = 0;

/**
 * Durable Object limiter for one prefix, kind and caller. Every window is
 * charged in a single all-or-nothing `win.hit` (one operation), with the
 * window and limit in each key so distinct limits never share a window. A
 * denial is remembered locally until it resets, so repeated blocked requests
 * cost no store operations. While the store is unavailable the same limits
 * apply per instance instead of none.
 */
function createGuardRateLimitBuckets(
  client: AbuseGuardClient | null,
  prefixBase: string,
  kind: 'get' | 'mutate',
  configs: RateLimitConfig[]
): RateLimitBucket[] {
  const [first] = configs;
  if (!first) return [];
  const tightest = configs.reduce((low, config) =>
    config.limit < low.limit ? config : low
  );
  return [
    {
      window: first.window,
      limiter: {
        async limit(identifier) {
          const partition = `${prefixBase}:${kind}:${identifier}`;
          const now = Date.now();
          const remembered = guardDenials.get(partition, now);
          if (remembered) {
            return {
              success: false,
              limit: remembered.limit,
              remaining: 0,
              reset: remembered.reset,
              window: remembered.window,
            };
          }
          const windows = configs.map((config) => ({
            key: `${config.window}:${config.limit}`,
            limit: config.limit,
            windowMs: RATE_LIMIT_DURATION_MS[config.duration],
          }));
          try {
            // `off` (switched off or misconfigured) uses the outage limits.
            if (!client) throw new Error('abuse guard store is off');
            const outcome = await client.hitWindows([
              {
                partition,
                windows: windows.map((window) => ({
                  ...window,
                  algo: 'sliding' as const,
                })),
              },
            ]);
            if (outcome.ok) {
              return {
                success: true,
                limit: tightest.limit,
                remaining: outcome.remaining,
                reset: outcome.resetAt,
              };
            }
            const deniedIndex = Math.max(
              0,
              outcome.windows.findIndex(
                (window) =>
                  window.remaining === 0 && window.resetAt === outcome.resetAt
              )
            );
            const denied = configs[deniedIndex] ?? first;
            guardDenials.set(
              partition,
              {
                window: denied.window,
                limit: denied.limit,
                reset: outcome.resetAt,
              },
              outcome.resetAt
            );
            return {
              success: false,
              limit: denied.limit,
              remaining: 0,
              reset: outcome.resetAt,
              window: denied.window,
            };
          } catch (error) {
            if (now >= nextOutageWarningAt) {
              nextOutageWarningAt = now + 60_000;
              console.warn(
                '[ProxyGuard] guard store unavailable; applying per-instance limits',
                error
              );
            }
            const denied = outageLimiter.hit(
              windows.map((window) => ({
                ...window,
                key: `${partition}:${window.key}`,
              })),
              now
            );
            const deniedConfig = denied
              ? configs[
                  windows.findIndex(
                    (window) =>
                      `${partition}:${window.key}` === denied.window.key
                  )
                ]
              : undefined;
            return denied
              ? {
                  success: false,
                  limit: denied.window.limit,
                  remaining: 0,
                  reset: denied.resetAt,
                  window: deniedConfig?.window ?? first.window,
                }
              : {
                  success: true,
                  limit: tightest.limit,
                  remaining: 0,
                  reset: now,
                };
          }
        },
      },
    },
  ];
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
  if (selection.kind !== 'legacy') {
    const client =
      selection.kind === 'durable-object' ? selection.client : null;
    const limiters = {
      get: createGuardRateLimitBuckets(client, prefixBase, 'get', profile.get),
      mutate: createGuardRateLimitBuckets(
        client,
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
