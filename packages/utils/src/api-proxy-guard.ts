import { Ratelimit } from '@upstash/ratelimit';
import type { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { extractIPFromRequest, isIPBlockedEdge } from './abuse-protection/edge';
import { getUpstashRestRedisClient } from './upstash-rest';

const MAX_PAYLOAD_SIZE = 200 * 1024; // 200KB

export type RateLimitWindow = 'minute' | 'hour' | 'day';

export type RateLimitConfig = {
  duration: '1 m' | '1 h' | '1 d';
  limit: number;
  window: RateLimitWindow;
};

export type RateLimitProfile = {
  get: RateLimitConfig[];
  mutate: RateLimitConfig[];
};

export type ProxyRoutePolicy = {
  key: string;
  matches: (req: NextRequest) => boolean;
  rateLimits: RateLimitProfile;
};

export type TrustedProxyBypassRule = {
  matches: (pathname: string, headers: Headers) => boolean;
};

export type GuardOptions = {
  prefixBase: string;
  routePolicies?: ProxyRoutePolicy[];
  trustedBypassRules?: TrustedProxyBypassRule[];
};

type RateLimitBucket = {
  limiter: Ratelimit | null;
  window: RateLimitWindow;
};

type Limiters = {
  get: RateLimitBucket[];
  mutate: RateLimitBucket[];
};

const limiterCache = new Map<string, Limiters>();
const cache = new Map();

const NO_READ_RATE_LIMITS: RateLimitConfig[] = [];

const MEET_TOGETHER_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 5, duration: '1 m' },
  { window: 'hour', limit: 50, duration: '1 h' },
  { window: 'day', limit: 200, duration: '1 d' },
];

const STUDENTS_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 5, duration: '1 m' },
  { window: 'hour', limit: 50, duration: '1 h' },
  { window: 'day', limit: 200, duration: '1 d' },
];

const USERS_ME_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 10, duration: '1 m' },
  { window: 'hour', limit: 90, duration: '1 h' },
  { window: 'day', limit: 240, duration: '1 d' },
];

const DEFAULT_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 12, duration: '1 m' },
  { window: 'hour', limit: 120, duration: '1 h' },
  { window: 'day', limit: 400, duration: '1 d' },
];

const DEFAULT_ROUTE_POLICIES: ProxyRoutePolicy[] = [
  {
    key: 'meet-together',
    matches: (req) =>
      req.nextUrl.pathname === '/api/meet-together' ||
      req.nextUrl.pathname.startsWith('/api/meet-together'),
    rateLimits: {
      get: NO_READ_RATE_LIMITS,
      mutate: MEET_TOGETHER_MUTATE_RATE_LIMITS,
    },
  },
  {
    key: 'students',
    matches: (req) =>
      req.nextUrl.pathname === '/api/students' ||
      req.nextUrl.pathname.startsWith('/api/students'),
    rateLimits: {
      get: NO_READ_RATE_LIMITS,
      mutate: STUDENTS_MUTATE_RATE_LIMITS,
    },
  },
  {
    key: 'users-me',
    matches: (req) =>
      req.nextUrl.pathname === '/api/v1/users/me' ||
      req.nextUrl.pathname.startsWith('/api/v1/users/me'),
    rateLimits: {
      get: NO_READ_RATE_LIMITS,
      mutate: USERS_ME_MUTATE_RATE_LIMITS,
    },
  },
  {
    key: 'default',
    matches: () => true,
    rateLimits: {
      get: NO_READ_RATE_LIMITS,
      mutate: DEFAULT_MUTATE_RATE_LIMITS,
    },
  },
];

function hasBearerToken(headers: Headers, secrets: Array<string | undefined>) {
  const authHeader = headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  return secrets.some(
    (secret) => !!secret && authHeader === `Bearer ${secret}`
  );
}

function hasHeaderToken(
  headers: Headers,
  headerName: string,
  secrets: Array<string | undefined>
) {
  const headerValue = headers.get(headerName);
  if (!headerValue) {
    return false;
  }

  return secrets.some((secret) => !!secret && headerValue === secret);
}

const DEFAULT_TRUSTED_BYPASS_RULES: TrustedProxyBypassRule[] = [
  {
    matches: (pathname, headers) =>
      (pathname === '/api/cron' || pathname.startsWith('/api/cron/')) &&
      (hasBearerToken(headers, [
        process.env.CRON_SECRET,
        process.env.VERCEL_CRON_SECRET,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ]) ||
        hasHeaderToken(headers, 'x-cron-secret', [
          process.env.CRON_SECRET,
          process.env.VERCEL_CRON_SECRET,
        ]) ||
        hasHeaderToken(headers, 'x-vercel-cron-secret', [
          process.env.CRON_SECRET,
          process.env.VERCEL_CRON_SECRET,
        ])),
  },
  {
    matches: (pathname, headers) =>
      (pathname === '/api/v1/webhooks' ||
        pathname.startsWith('/api/v1/webhooks/')) &&
      !!process.env.SUPABASE_WEBHOOK_SECRET &&
      headers.get('x-webhook-secret') === process.env.SUPABASE_WEBHOOK_SECRET,
  },
];

function createRateLimitBuckets(
  redis: Redis,
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
      ephemeralCache: cache,
      analytics: false,
    }),
  }));
}

async function getRateLimiters(
  prefixBase: string,
  profile: RateLimitProfile
): Promise<Limiters> {
  const cacheKey = `${prefixBase}:${JSON.stringify(profile)}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const redis = getUpstashRestRedisClient();

  const limiters = {
    get: createRateLimitBuckets(redis, prefixBase, 'get', profile.get),
    mutate: createRateLimitBuckets(redis, prefixBase, 'mutate', profile.mutate),
  };

  limiterCache.set(cacheKey, limiters);
  return limiters;
}

function getRoutePolicy(
  req: NextRequest,
  routePolicies: ProxyRoutePolicy[]
): ProxyRoutePolicy {
  return (
    routePolicies.find((routePolicy) => routePolicy.matches(req)) ??
    DEFAULT_ROUTE_POLICIES[DEFAULT_ROUTE_POLICIES.length - 1]!
  );
}

function buildRateLimitResponse(
  status: 429,
  retryAfter: number,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    { error: 'Too Many Requests', message: 'Rate limit exceeded' },
    {
      status,
      headers: {
        'Retry-After': `${retryAfter}`,
        ...headers,
      },
    }
  );
}

export function isTrustedProxyBypassRequest(
  pathname: string,
  headers: Headers,
  trustedBypassRules: TrustedProxyBypassRule[] = DEFAULT_TRUSTED_BYPASS_RULES
): boolean {
  return trustedBypassRules.some((rule) => rule.matches(pathname, headers));
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

  const routePolicies = options.routePolicies ?? DEFAULT_ROUTE_POLICIES;
  const trustedBypassRules = [
    ...DEFAULT_TRUSTED_BYPASS_RULES,
    ...(options.trustedBypassRules ?? []),
  ];

  if (
    !isTrustedProxyBypassRequest(
      req.nextUrl.pathname,
      req.headers,
      trustedBypassRules
    )
  ) {
    const ip = extractIPFromRequest(req.headers);

    if (ip === 'unknown') {
      return NextResponse.json(
        {
          error: 'Unknown Client IP',
          message: 'Unable to determine client IP address',
        },
        { status: 400 }
      );
    }

    try {
      const blockInfo = await isIPBlockedEdge(ip);
      if (blockInfo) {
        const retryAfter = Math.max(
          1,
          Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
        );

        return buildRateLimitResponse(429, retryAfter);
      }

      const routePolicy = getRoutePolicy(req, routePolicies);
      const isRead = req.method === 'GET' || req.method === 'HEAD';
      const limiters = await getRateLimiters(
        `${options.prefixBase}:${routePolicy.key}`,
        routePolicy.rateLimits
      );
      const activeLimiters = isRead ? limiters.get : limiters.mutate;

      for (const { limiter, window } of activeLimiters) {
        if (!limiter) {
          continue;
        }

        const { success, limit, remaining, reset } = await limiter.limit(ip);

        const consumed = limit - remaining;
        const kind = isRead ? 'read' : 'mutate';
        console.log(
          `[ProxyGuard] ${routePolicy.key}:${kind}:${window} ${consumed}/${limit} | IP: ${ip} | path: ${req.nextUrl.pathname}`
        );

        if (!success) {
          const retryAfter = Math.max(
            1,
            Math.ceil((reset - Date.now()) / 1000)
          );

          return buildRateLimitResponse(429, retryAfter, {
            'X-RateLimit-Limit': `${limit}`,
            'X-RateLimit-Remaining': `${remaining}`,
            'X-RateLimit-Reset': `${Math.ceil(reset / 1000)}`,
            'X-RateLimit-Window': window,
            'X-RateLimit-Policy': routePolicy.key,
          });
        }
      }
    } catch (error) {
      console.error('[ProxyGuard] Rate limiter error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Rate limiter failure' },
        { status: 500 }
      );
    }
  }

  return null;
}
