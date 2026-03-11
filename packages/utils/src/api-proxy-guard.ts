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

const DEFAULT_GET_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 60, duration: '1 m' },
  { window: 'hour', limit: 600, duration: '1 h' },
  { window: 'day', limit: 4000, duration: '1 d' },
];

const DEFAULT_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 12, duration: '1 m' },
  { window: 'hour', limit: 120, duration: '1 h' },
  { window: 'day', limit: 400, duration: '1 d' },
];

const USERS_ME_GET_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 30, duration: '1 m' },
  { window: 'hour', limit: 300, duration: '1 h' },
  { window: 'day', limit: 1200, duration: '1 d' },
];

const USERS_ME_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 10, duration: '1 m' },
  { window: 'hour', limit: 90, duration: '1 h' },
  { window: 'day', limit: 240, duration: '1 d' },
];

const AUTH_RATE_LIMITS: RateLimitProfile = {
  get: [
    { window: 'minute', limit: 3, duration: '1 m' },
    { window: 'hour', limit: 12, duration: '1 h' },
    { window: 'day', limit: 30, duration: '1 d' },
  ],
  mutate: [
    { window: 'minute', limit: 3, duration: '1 m' },
    { window: 'hour', limit: 12, duration: '1 h' },
    { window: 'day', limit: 30, duration: '1 d' },
  ],
};

const HIGH_FANOUT_RATE_LIMITS: RateLimitProfile = {
  get: DEFAULT_GET_RATE_LIMITS,
  mutate: [
    { window: 'minute', limit: 2, duration: '1 m' },
    { window: 'hour', limit: 20, duration: '1 h' },
    { window: 'day', limit: 60, duration: '1 d' },
  ],
};

const DEFAULT_ROUTE_POLICIES: ProxyRoutePolicy[] = [
  {
    key: 'auth',
    matches: (req) =>
      req.nextUrl.pathname.startsWith('/api/auth/mfa/') ||
      /^\/api\/v1\/auth\/mobile\/(?:send-otp|verify-otp|password-login)(?:\/|$)/.test(
        req.nextUrl.pathname
      ),
    rateLimits: AUTH_RATE_LIMITS,
  },
  {
    key: 'high-fanout',
    matches: (req) =>
      /^\/api\/v1\/workspaces\/[^/]+\/mail\/send(?:\/|$)/.test(
        req.nextUrl.pathname
      ) ||
      /^\/api\/v1\/workspaces\/[^/]+\/users\/[^/]+\/follow-up(?:\/|$)/.test(
        req.nextUrl.pathname
      ) ||
      /^\/api\/v1\/workspaces\/[^/]+\/user-groups\/[^/]+\/group-checks\/[^/]+\/email(?:\/|$)/.test(
        req.nextUrl.pathname
      ),
    rateLimits: HIGH_FANOUT_RATE_LIMITS,
  },
  {
    key: 'users-me',
    matches: (req) => req.nextUrl.pathname.startsWith('/api/v1/users/me'),
    rateLimits: {
      get: USERS_ME_GET_RATE_LIMITS,
      mutate: USERS_ME_MUTATE_RATE_LIMITS,
    },
  },
  {
    key: 'default',
    matches: () => true,
    rateLimits: {
      get: DEFAULT_GET_RATE_LIMITS,
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

function hasPolarWebhookSignatureHeaders(headers: Headers) {
  return (
    !!headers.get('webhook-id') &&
    !!headers.get('webhook-timestamp') &&
    !!headers.get('webhook-signature')
  );
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
      (pathname === '/api/payment/webhooks' ||
        pathname.startsWith('/api/payment/webhooks/')) &&
      !!process.env.POLAR_WEBHOOK_SECRET &&
      hasPolarWebhookSignatureHeaders(headers),
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

async function getRateLimiters(
  prefixBase: string,
  profile: RateLimitProfile
): Promise<Limiters> {
  const cacheKey = `${prefixBase}:${JSON.stringify(profile)}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const redis = await getUpstashRatelimitRedisClient();
  if (!redis) {
    const disabled = { get: [], mutate: [] };
    limiterCache.set(cacheKey, disabled);
    return disabled;
  }

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
    !isDev &&
    !isTrustedProxyBypassRequest(
      req.nextUrl.pathname,
      req.headers,
      trustedBypassRules
    )
  ) {
    const ip = extractIPFromRequest(req.headers);

    if (ip !== 'unknown') {
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

        if (isDev) {
          const consumed = limit - remaining;
          const kind = isRead ? 'read' : 'mutate';
          console.log(
            `[ProxyGuard] ${routePolicy.key}:${kind}:${window} ${consumed}/${limit} | IP: ${ip} | path: ${req.nextUrl.pathname}`
          );
        }

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
    }
  }

  return (await validateRequestEmojiLimit(req)) ?? null;
}
