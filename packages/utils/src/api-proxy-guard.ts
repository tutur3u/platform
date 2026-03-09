import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { extractIPFromRequest, isIPBlockedEdge } from './abuse-protection/edge';
import { MAX_PAYLOAD_SIZE } from './constants';
import { validateRequestEmojiLimit } from './request-emoji-limit';

const isDev = process.env.NODE_ENV !== 'production';

type GuardOptions = {
  prefixBase: string;
};

type Limiters = {
  get: Ratelimit | null;
  mutate: Ratelimit | null;
};

const limiterCache = new Map<string, Limiters>();

function getRateLimiters(prefixBase: string): Limiters {
  const cached = limiterCache.get(prefixBase);
  if (cached) {
    return cached;
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    const disabled = { get: null, mutate: null };
    limiterCache.set(prefixBase, disabled);
    return disabled;
  }

  const redis = new Redis({ url: redisUrl, token: redisToken });
  const limiters = {
    get: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, '1 m'),
      prefix: `${prefixBase}:get`,
      analytics: false,
    }),
    mutate: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 m'),
      prefix: `${prefixBase}:mutate`,
      analytics: false,
    }),
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
      const limiter = isRead
        ? getRateLimiters(options.prefixBase).get
        : getRateLimiters(options.prefixBase).mutate;

      if (limiter) {
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
              },
            }
          );
        }
      }
    }
  }

  return validateRequestEmojiLimit(req);
}
