import { Ratelimit } from '@upstash/ratelimit';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { extractIPFromRequest, isIPBlockedEdge } from './abuse-protection/edge';
import { MAX_PAYLOAD_SIZE } from './constants';
import { validateRequestEmojiLimit } from './request-emoji-limit';
import {
  getUpstashRatelimitRedisClient,
  type UpstashRatelimitRedisClient,
} from './upstash-rest';

const isDev = process.env.NODE_ENV !== 'production';

type GuardOptions = {
  prefixBase: string;
};

type RateLimitWindow = 'minute' | 'hour' | 'day';

type RateLimitBucket = {
  limiter: Ratelimit | null;
  window: RateLimitWindow;
};

type RateLimitConfig = {
  duration: '1 m' | '1 h' | '1 d';
  limit: number;
  window: RateLimitWindow;
};

type Limiters = {
  get: RateLimitBucket[];
  mutate: RateLimitBucket[];
};

const limiterCache = new Map<string, Limiters>();

function createRateLimitBuckets(
  redis: UpstashRatelimitRedisClient,
  prefixBase: string,
  kind: 'get' | 'mutate'
): RateLimitBucket[] {
  const configs: RateLimitConfig[] =
    kind === 'get'
      ? [
          { window: 'minute' as const, limit: 120, duration: '1 m' },
          { window: 'hour' as const, limit: 2000, duration: '1 h' },
          { window: 'day' as const, limit: 10000, duration: '1 d' },
        ]
      : [
          { window: 'minute' as const, limit: 30, duration: '1 m' },
          { window: 'hour' as const, limit: 300, duration: '1 h' },
          { window: 'day' as const, limit: 1000, duration: '1 d' },
        ];

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

async function getRateLimiters(prefixBase: string): Promise<Limiters> {
  const cached = limiterCache.get(prefixBase);
  if (cached) {
    return cached;
  }

  const redis = await getUpstashRatelimitRedisClient();
  if (!redis) {
    const disabled = { get: [], mutate: [] };
    limiterCache.set(prefixBase, disabled);
    return disabled;
  }

  const limiters = {
    get: createRateLimitBuckets(redis, prefixBase, 'get'),
    mutate: createRateLimitBuckets(redis, prefixBase, 'mutate'),
  };

  limiterCache.set(prefixBase, limiters);
  return limiters;
}

export function clearApiProxyGuardLimiterCache() {
  limiterCache.clear();
}

export async function guardApiProxyRequest(
  req: NextRequest,
  options: GuardOptions
): Promise<NextResponse | null> {
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(size) && size > MAX_PAYLOAD_SIZE) {
      return NextResponse.json(
        { error: 'Payload Too Large', message: 'Request body exceeds limit' },
        { status: 413 }
      );
    }
  }

  if (!isDev) {
    const ip = extractIPFromRequest(req.headers);

    if (ip !== 'unknown') {
      const blockInfo = await isIPBlockedEdge(ip);
      if (blockInfo) {
        const retryAfter = Math.max(
          1,
          Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
        );

        return NextResponse.json(
          { error: 'Too Many Requests', message: 'Rate limit exceeded' },
          {
            status: 429,
            headers: { 'Retry-After': `${retryAfter}` },
          }
        );
      }

      const isRead = req.method === 'GET' || req.method === 'HEAD';
      const rateLimiters = await getRateLimiters(options.prefixBase);
      const limiters = isRead ? rateLimiters.get : rateLimiters.mutate;

      for (const { limiter, window } of limiters) {
        if (!limiter) {
          continue;
        }

        const { success, limit, remaining, reset } = await limiter.limit(ip);

        if (!success) {
          const retryAfter = Math.max(
            1,
            Math.ceil((reset - Date.now()) / 1000)
          );

          return NextResponse.json(
            { error: 'Too Many Requests', message: 'Rate limit exceeded' },
            {
              status: 429,
              headers: {
                'Retry-After': `${retryAfter}`,
                'X-RateLimit-Limit': `${limit}`,
                'X-RateLimit-Remaining': `${remaining}`,
                'X-RateLimit-Reset': `${Math.ceil(reset / 1000)}`,
                'X-RateLimit-Window': window,
              },
            }
          );
        }
      }
    }
  }

  return validateRequestEmojiLimit(req);
}
