import { Ratelimit } from '@upstash/ratelimit';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { extractIPFromRequest, isIPBlockedEdge } from './abuse-protection/edge';
import { DEV_MODE, MAX_PAYLOAD_SIZE } from './constants';
import { validateRequestEmojiLimit } from './request-emoji-limit';
import {
  getUpstashRatelimitRedisClient,
  type UpstashRatelimitRedisClient,
} from './upstash-rest';

const isDev = process.env.NODE_ENV !== 'production';

type CallerClass = 'anonymous' | 'authenticated';

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
  limiter: RateLimiter;
  window: RateLimitWindow;
};

type Limiters = {
  get: RateLimitBucket[];
  mutate: RateLimitBucket[];
};

type RateLimitResult = {
  limit: number;
  remaining: number;
  reset: number;
  success: boolean;
};

type RateLimiter = {
  limit: (identifier: string) => Promise<RateLimitResult>;
};

type LocalRateLimitState = {
  count: number;
  reset: number;
};

const limiterCache = new Map<string, Limiters>();
const localLimiterState = new Map<string, LocalRateLimitState>();
const GENERIC_SUPABASE_AUTH_COOKIE_NAME_PATTERN =
  /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i;
const UUID_PATH_SEGMENT =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const FINANCE_INVOICE_CREATE_SUPPORT_READ_PATH_PATTERN = new RegExp(
  `^/api/v1/workspaces/[^/]+/(?:finance/invoices(?:/subscription/context)?|inventory/products|promotions|settings/(?:configs|[^/]+)|user-groups(?:/linked-products|/${UUID_PATH_SEGMENT}/linked-products)|users(?:/${UUID_PATH_SEGMENT}(?:/(?:linked-promotions|referral-discounts|user-groups))?)?|wallets)/?$`,
  'u'
);
const FINANCE_INVOICE_TRANSACTION_CATEGORIES_PATH_PATTERN =
  /^\/api\/workspaces\/[^/]+\/transactions\/categories\/?$/u;
const FINANCE_READ_PATH_PATTERNS = [
  /^\/api\/workspaces\/[^/]+\/finance(?:\/|$)/u,
  /^\/api\/workspaces\/[^/]+\/transactions(?:\/|$)/u,
  /^\/api\/workspaces\/[^/]+\/wallets(?:\/|$)/u,
  /^\/api\/workspaces\/[^/]+\/tags(?:\/|$)/u,
  /^\/api\/v1\/workspaces\/[^/]+\/finance(?:\/|$)/u,
  /^\/api\/v1\/workspaces\/[^/]+\/wallets(?:\/|$)/u,
] as const;

const NO_READ_RATE_LIMITS: RateLimitConfig[] = [];

function parsePositiveIntEnv(
  name: string,
  fallback: number,
  aliases: string[] = []
): number {
  const rawValue = process.env[name];
  if (rawValue) {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  for (const alias of aliases) {
    const aliasValue = process.env[alias];
    if (!aliasValue) {
      continue;
    }

    const parsed = Number.parseInt(aliasValue, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function createConfig(
  window: RateLimitWindow,
  duration: '1 m' | '1 h' | '1 d',
  fallback: number,
  envName: string,
  envAliases: string[] = []
): RateLimitConfig {
  return {
    window,
    duration,
    limit: parsePositiveIntEnv(envName, fallback, envAliases),
  };
}

const DEFAULT_ANONYMOUS_READ_RATE_LIMITS: RateLimitConfig[] = [
  createConfig('minute', '1 m', 60, 'API_PROXY_ANON_READ_LIMIT_MINUTE'),
  createConfig('hour', '1 h', 240, 'API_PROXY_ANON_READ_LIMIT_HOUR'),
  createConfig('day', '1 d', 1200, 'API_PROXY_ANON_READ_LIMIT_DAY'),
];

const DEFAULT_ANONYMOUS_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  createConfig('minute', '1 m', 30, 'API_PROXY_ANON_MUTATE_LIMIT_MINUTE'),
  createConfig('hour', '1 h', 120, 'API_PROXY_ANON_MUTATE_LIMIT_HOUR'),
  createConfig('day', '1 d', 600, 'API_PROXY_ANON_MUTATE_LIMIT_DAY'),
];

const DEFAULT_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 60, duration: '1 m' },
  { window: 'hour', limit: 300, duration: '1 h' },
  { window: 'day', limit: 2000, duration: '1 d' },
];

const USERS_ME_MUTATE_RATE_LIMITS: RateLimitConfig[] = [
  { window: 'minute', limit: 60, duration: '1 m' },
  { window: 'hour', limit: 200, duration: '1 h' },
  { window: 'day', limit: 1200, duration: '1 d' },
];

const AUTH_RATE_LIMITS: RateLimitProfile = {
  get: NO_READ_RATE_LIMITS,
  mutate: [
    { window: 'minute', limit: 3, duration: '1 m' },
    { window: 'hour', limit: 12, duration: '1 h' },
    { window: 'day', limit: 30, duration: '1 d' },
  ],
};

const PASSWORD_LOGIN_RATE_LIMITS: RateLimitProfile = {
  get: NO_READ_RATE_LIMITS,
  mutate: [
    createConfig('minute', '1 m', 60, 'API_PROXY_PASSWORD_LOGIN_LIMIT_MINUTE'),
    createConfig('hour', '1 h', 600, 'API_PROXY_PASSWORD_LOGIN_LIMIT_HOUR'),
    createConfig('day', '1 d', 4000, 'API_PROXY_PASSWORD_LOGIN_LIMIT_DAY'),
  ],
};

const OTP_SEND_RATE_LIMITS: RateLimitProfile = {
  get: NO_READ_RATE_LIMITS,
  mutate: [
    createConfig('minute', '1 m', 30, 'API_PROXY_OTP_SEND_LIMIT_MINUTE'),
    createConfig('hour', '1 h', 180, 'API_PROXY_OTP_SEND_LIMIT_HOUR'),
    createConfig('day', '1 d', 300, 'API_PROXY_OTP_SEND_LIMIT_DAY'),
  ],
};

const OTP_VERIFY_RATE_LIMITS: RateLimitProfile = {
  get: NO_READ_RATE_LIMITS,
  mutate: [
    createConfig('minute', '1 m', 60, 'API_PROXY_OTP_VERIFY_LIMIT_MINUTE'),
    createConfig('hour', '1 h', 600, 'API_PROXY_OTP_VERIFY_LIMIT_HOUR'),
    createConfig('day', '1 d', 4000, 'API_PROXY_OTP_VERIFY_LIMIT_DAY'),
  ],
};

const CRON_RATE_LIMITS: RateLimitProfile = {
  get: [
    createConfig('minute', '1 m', 10, 'API_PROXY_CRON_READ_LIMIT_MINUTE'),
    createConfig('hour', '1 h', 60, 'API_PROXY_CRON_READ_LIMIT_HOUR'),
    createConfig('day', '1 d', 200, 'API_PROXY_CRON_READ_LIMIT_DAY'),
  ],
  mutate: [
    createConfig('minute', '1 m', 10, 'API_PROXY_CRON_MUTATE_LIMIT_MINUTE'),
    createConfig('hour', '1 h', 60, 'API_PROXY_CRON_MUTATE_LIMIT_HOUR'),
    createConfig('day', '1 d', 200, 'API_PROXY_CRON_MUTATE_LIMIT_DAY'),
  ],
};

const CROSS_APP_RETURN_RATE_LIMITS: RateLimitProfile = {
  get: NO_READ_RATE_LIMITS,
  mutate: [
    createConfig(
      'minute',
      '1 m',
      180,
      'API_PROXY_CROSS_APP_RETURN_LIMIT_MINUTE'
    ),
    createConfig('hour', '1 h', 2000, 'API_PROXY_CROSS_APP_RETURN_LIMIT_HOUR'),
    createConfig('day', '1 d', 10_000, 'API_PROXY_CROSS_APP_RETURN_LIMIT_DAY'),
  ],
};

const HIGH_FANOUT_RATE_LIMITS: RateLimitProfile = {
  get: NO_READ_RATE_LIMITS,
  mutate: [
    { window: 'minute', limit: 2, duration: '1 m' },
    { window: 'hour', limit: 20, duration: '1 h' },
    { window: 'day', limit: 60, duration: '1 d' },
  ],
};

const TASK_DESCRIPTION_RATE_LIMITS: RateLimitProfile = {
  get: NO_READ_RATE_LIMITS,
  mutate: [
    { window: 'minute', limit: 60, duration: '1 m' },
    { window: 'hour', limit: 600, duration: '1 h' },
    { window: 'day', limit: 4000, duration: '1 d' },
  ],
};

const FORM_SUBMISSION_RATE_LIMITS: RateLimitProfile = {
  get: NO_READ_RATE_LIMITS,
  mutate: [
    { window: 'minute', limit: 60, duration: '1 m' },
    { window: 'hour', limit: 600, duration: '1 h' },
    { window: 'day', limit: 4000, duration: '1 d' },
  ],
};

const TASK_BOARD_READ_RATE_LIMITS: RateLimitProfile = {
  get: [
    createConfig(
      'minute',
      '1 m',
      300,
      'API_PROXY_TASK_BOARD_READ_LIMIT_MINUTE'
    ),
    createConfig('hour', '1 h', 3000, 'API_PROXY_TASK_BOARD_READ_LIMIT_HOUR'),
    createConfig('day', '1 d', 20_000, 'API_PROXY_TASK_BOARD_READ_LIMIT_DAY'),
  ],
  mutate: DEFAULT_MUTATE_RATE_LIMITS,
};

const FINANCE_READ_RATE_LIMITS: RateLimitProfile = {
  get: [
    createConfig('minute', '1 m', 1200, 'API_PROXY_FINANCE_READ_LIMIT_MINUTE', [
      'API_PROXY_FINANCE_INVOICE_CREATE_READ_LIMIT_MINUTE',
    ]),
    createConfig('hour', '1 h', 12_000, 'API_PROXY_FINANCE_READ_LIMIT_HOUR', [
      'API_PROXY_FINANCE_INVOICE_CREATE_READ_LIMIT_HOUR',
    ]),
    createConfig('day', '1 d', 80_000, 'API_PROXY_FINANCE_READ_LIMIT_DAY', [
      'API_PROXY_FINANCE_INVOICE_CREATE_READ_LIMIT_DAY',
    ]),
  ],
  mutate: DEFAULT_MUTATE_RATE_LIMITS,
};

function isFinanceInvoiceCreateSupportRead(req: NextRequest) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  return (
    FINANCE_INVOICE_CREATE_SUPPORT_READ_PATH_PATTERN.test(
      req.nextUrl.pathname
    ) ||
    FINANCE_INVOICE_TRANSACTION_CATEGORIES_PATH_PATTERN.test(
      req.nextUrl.pathname
    )
  );
}

function isFinanceRead(req: NextRequest) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  return FINANCE_READ_PATH_PATTERNS.some((pattern) =>
    pattern.test(req.nextUrl.pathname)
  );
}

const DEFAULT_ROUTE_POLICIES: ProxyRoutePolicy[] = [
  {
    key: 'cron',
    matches: (req) =>
      req.nextUrl.pathname === '/api/cron' ||
      req.nextUrl.pathname.startsWith('/api/cron/'),
    rateLimits: CRON_RATE_LIMITS,
  },
  {
    key: 'auth',
    matches: (req) =>
      req.nextUrl.pathname.startsWith('/api/auth/mfa/') ||
      /^\/api\/v1\/auth\/otp\/settings(?:\/|$)/.test(req.nextUrl.pathname),
    rateLimits: AUTH_RATE_LIMITS,
  },
  {
    key: 'password-login',
    matches: (req) =>
      /^\/api\/v1\/auth\/password-login(?:\/|$)/.test(req.nextUrl.pathname) ||
      /^\/api\/v1\/auth\/mobile\/password-login(?:\/|$)/.test(
        req.nextUrl.pathname
      ),
    rateLimits: PASSWORD_LOGIN_RATE_LIMITS,
  },
  {
    key: 'otp-send',
    matches: (req) =>
      /^\/api\/v1\/auth\/otp\/send(?:\/|$)/.test(req.nextUrl.pathname) ||
      /^\/api\/v1\/auth\/mobile\/send-otp(?:\/|$)/.test(req.nextUrl.pathname),
    rateLimits: OTP_SEND_RATE_LIMITS,
  },
  {
    key: 'otp-verify',
    matches: (req) =>
      /^\/api\/v1\/auth\/otp\/verify(?:\/|$)/.test(req.nextUrl.pathname) ||
      /^\/api\/v1\/auth\/mobile\/verify-otp(?:\/|$)/.test(req.nextUrl.pathname),
    rateLimits: OTP_VERIFY_RATE_LIMITS,
  },
  {
    key: 'cross-app-return',
    matches: (req) =>
      /^\/api\/v1\/auth\/cross-app-return(?:\/|$)/.test(req.nextUrl.pathname),
    rateLimits: CROSS_APP_RETURN_RATE_LIMITS,
  },
  {
    key: 'form-submission',
    matches: (req) =>
      req.method === 'POST' &&
      /^\/api\/v1\/shared\/forms\/[^/]+(?:\/|$)/.test(req.nextUrl.pathname),
    rateLimits: FORM_SUBMISSION_RATE_LIMITS,
  },
  {
    key: 'task-board-read',
    matches: (req) =>
      (req.method === 'GET' || req.method === 'HEAD') &&
      (/^\/api\/v1\/workspaces\/[^/]+\/tasks\/?$/u.test(req.nextUrl.pathname) ||
        /^\/api\/v1\/workspaces\/[^/]+\/task-boards\/[^/]+\/?$/u.test(
          req.nextUrl.pathname
        ) ||
        /^\/api\/v1\/workspaces\/[^/]+\/task-boards\/[^/]+\/lists\/?$/u.test(
          req.nextUrl.pathname
        )),
    rateLimits: TASK_BOARD_READ_RATE_LIMITS,
  },
  {
    key: 'finance-read',
    matches: isFinanceRead,
    rateLimits: FINANCE_READ_RATE_LIMITS,
  },
  {
    key: 'finance-invoice-create-read',
    matches: isFinanceInvoiceCreateSupportRead,
    rateLimits: FINANCE_READ_RATE_LIMITS,
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
    key: 'task-description',
    matches: (req) =>
      /^\/api\/v1\/workspaces\/[^/]+\/tasks\/[^/]+\/description(?:\/|$)/.test(
        req.nextUrl.pathname
      ),
    rateLimits: TASK_DESCRIPTION_RATE_LIMITS,
  },
  {
    key: 'users-me',
    matches: (req) => req.nextUrl.pathname.startsWith('/api/v1/users/me'),
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
  // Migration APIs: bypass rate limit in DEV_MODE (routes already return 403 in production)
  {
    matches: (pathname, _headers) =>
      pathname.startsWith('/api/v1/infrastructure/migrate/') && DEV_MODE,
  },
];

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

function rateLimitDurationMs(duration: RateLimitConfig['duration']) {
  switch (duration) {
    case '1 m':
      return 60_000;
    case '1 h':
      return 60 * 60_000;
    case '1 d':
      return 24 * 60 * 60_000;
  }
}

function createLocalRateLimiter(
  prefix: string,
  config: RateLimitConfig
): RateLimiter {
  const durationMs = rateLimitDurationMs(config.duration);

  return {
    async limit(identifier: string) {
      const now = Date.now();
      const key = `${prefix}:${identifier}`;
      let state = localLimiterState.get(key);

      if (!state || state.reset <= now) {
        state = {
          count: 0,
          reset: now + durationMs,
        };
      }

      if (state.count >= config.limit) {
        localLimiterState.set(key, state);
        return {
          limit: config.limit,
          remaining: 0,
          reset: state.reset,
          success: false,
        };
      }

      state.count += 1;
      localLimiterState.set(key, state);

      return {
        limit: config.limit,
        remaining: Math.max(0, config.limit - state.count),
        reset: state.reset,
        success: true,
      };
    },
  };
}

function createLocalRateLimitBuckets(
  prefixBase: string,
  kind: 'get' | 'mutate',
  configs: RateLimitConfig[]
): RateLimitBucket[] {
  return configs.map((config) => ({
    window: config.window,
    limiter: createLocalRateLimiter(
      `${prefixBase}:local:${kind}:${config.window}`,
      config
    ),
  }));
}

function createLocalRateLimiters(
  prefixBase: string,
  profile: RateLimitProfile
): Limiters {
  return {
    get: createLocalRateLimitBuckets(prefixBase, 'get', profile.get),
    mutate: createLocalRateLimitBuckets(prefixBase, 'mutate', profile.mutate),
  };
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

  const redis = await getUpstashRatelimitRedisClient().catch(() => null);
  if (!redis) {
    const localLimiters = createLocalRateLimiters(prefixBase, profile);
    limiterCache.set(cacheKey, localLimiters);
    return localLimiters;
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

function replaceWithLocalRateLimiters(
  cacheKey: string,
  prefixBase: string,
  profile: RateLimitProfile
): Limiters {
  const localLimiters = createLocalRateLimiters(prefixBase, profile);
  limiterCache.set(cacheKey, localLimiters);
  return localLimiters;
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
        'Cache-Control': 'no-store',
        'Retry-After': `${retryAfter}`,
        ...headers,
      },
    }
  );
}

function looksLikeSupabaseJwt(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  return parts.every(
    (part) => /^[A-Za-z0-9_-]+$/.test(part) && part.length > 0
  );
}

function looksLikeWorkspaceApiKey(token: string): boolean {
  return /^ttr_[A-Za-z0-9_-]+$/.test(token);
}

function hasAuthenticatedBearerToken(headers: Headers): boolean {
  const authHeader = headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const trimmedHeader = authHeader.trim();
  if (looksLikeWorkspaceApiKey(trimmedHeader)) {
    return true;
  }

  if (!trimmedHeader.toLowerCase().startsWith('bearer ')) {
    return false;
  }

  const token = trimmedHeader.slice(7).trim();
  return looksLikeSupabaseJwt(token) || looksLikeWorkspaceApiKey(token);
}

function getSupabaseAuthStorageKey(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

function isSupabaseAuthCookieName(
  cookieName: string,
  storageKeys: string[]
): boolean {
  for (const storageKey of storageKeys) {
    if (
      cookieName === storageKey ||
      (/^\d+$/.test(cookieName.slice(storageKey.length + 1)) &&
        cookieName.startsWith(`${storageKey}.`))
    ) {
      return true;
    }
  }

  return (
    storageKeys.length === 0 &&
    GENERIC_SUPABASE_AUTH_COOKIE_NAME_PATTERN.test(cookieName)
  );
}

function getSupabaseAuthStorageKeys(): string[] {
  const storageKeys = [
    getSupabaseAuthStorageKey(process.env.NEXT_PUBLIC_SUPABASE_URL),
    getSupabaseAuthStorageKey(process.env.SUPABASE_SERVER_URL),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(storageKeys)];
}

export function hasSupabaseSessionCookie(req: NextRequest): boolean {
  const storageKeys = getSupabaseAuthStorageKeys();

  return req.cookies
    .getAll()
    .some((cookie) => isSupabaseAuthCookieName(cookie.name, storageKeys));
}

export function hasAuthenticatedApiSession(req: NextRequest): boolean {
  if (
    hasAuthenticatedBearerToken(req.headers) ||
    hasSupabaseSessionCookie(req)
  ) {
    return true;
  }

  return false;
}

function getCallerClass(req: NextRequest): CallerClass {
  void req;
  return 'anonymous';
}

function getEffectiveRateLimits(
  routePolicy: ProxyRoutePolicy,
  callerClass: CallerClass
): RateLimitProfile {
  if (callerClass === 'authenticated') {
    return routePolicy.rateLimits;
  }

  if (routePolicy.key === 'default' || routePolicy.key === 'users-me') {
    return {
      get: DEFAULT_ANONYMOUS_READ_RATE_LIMITS,
      mutate: DEFAULT_ANONYMOUS_MUTATE_RATE_LIMITS,
    };
  }

  return routePolicy.rateLimits;
}

function shouldScopeRateLimitByPath(routePolicy: ProxyRoutePolicy): boolean {
  return routePolicy.key === 'default' || routePolicy.key === 'users-me';
}

function getPathScopedRateLimitPrefix(
  prefixBase: string,
  routePolicy: ProxyRoutePolicy,
  callerClass: CallerClass,
  pathname: string
): string {
  const scopeSuffix = shouldScopeRateLimitByPath(routePolicy)
    ? `:${pathname.replaceAll('/', ':') || ':root'}`
    : '';

  return `${prefixBase}:${routePolicy.key}:${callerClass}${scopeSuffix}`;
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
  localLimiterState.clear();
}

async function requestBodyExceedsLimit(
  req: NextRequest,
  maxBytes: number
): Promise<boolean> {
  const body = req.clone().body;
  if (!body) {
    return false;
  }

  const reader = body.getReader();
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return false;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        void reader.cancel().catch(() => {});
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
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

  if (await requestBodyExceedsLimit(req, MAX_PAYLOAD_SIZE)) {
    return NextResponse.json(
      { error: 'Payload Too Large', message: 'Request body exceeds limit' },
      { status: 413 }
    );
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
    const callerClass = getCallerClass(req);
    const ip = extractIPFromRequest(req.headers);

    if (ip !== 'unknown' && callerClass === 'anonymous') {
      const blockInfo = await isIPBlockedEdge(ip);
      if (blockInfo) {
        const retryAfter = Math.max(
          1,
          Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
        );

        return buildRateLimitResponse(429, retryAfter, {
          'X-Proxy-Block-Reason': 'ip-already-blocked',
        });
      }

      const routePolicy = getRoutePolicy(req, routePolicies);
      const isRead = req.method === 'GET' || req.method === 'HEAD';
      const rateLimits = getEffectiveRateLimits(routePolicy, callerClass);
      const limiterPrefix = getPathScopedRateLimitPrefix(
        options.prefixBase,
        routePolicy,
        callerClass,
        req.nextUrl.pathname
      );
      const limiterCacheKey = `${limiterPrefix}:${JSON.stringify(rateLimits)}`;
      const limiters = await getRateLimiters(limiterPrefix, rateLimits);
      let activeLimiters = isRead ? limiters.get : limiters.mutate;

      for (let index = 0; index < activeLimiters.length; index += 1) {
        const { limiter, window } = activeLimiters[index]!;
        let result: RateLimitResult;

        try {
          result = await limiter.limit(ip);
        } catch {
          const fallbackLimiters = replaceWithLocalRateLimiters(
            limiterCacheKey,
            limiterPrefix,
            rateLimits
          );
          activeLimiters = isRead
            ? fallbackLimiters.get
            : fallbackLimiters.mutate;
          const fallbackBucket =
            activeLimiters[index] ??
            activeLimiters.find((bucket) => bucket.window === window);

          if (!fallbackBucket) {
            continue;
          }

          result = await fallbackBucket.limiter.limit(ip);
        }

        const { success, limit, remaining, reset } = result;

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
            'X-Proxy-Block-Reason': 'route-rate-limit',
            'X-RateLimit-Limit': `${limit}`,
            'X-RateLimit-Remaining': `${remaining}`,
            'X-RateLimit-Reset': `${Math.ceil(reset / 1000)}`,
            'X-RateLimit-Caller-Class': callerClass,
            'X-RateLimit-Window': window,
            'X-RateLimit-Policy': routePolicy.key,
          });
        }
      }
    }
  }

  const allowDescriptionYjsState =
    /\/api\/v1\/workspaces\/[^/]+\/tasks\/[^/]+\/description$/.test(
      req.nextUrl.pathname
    );
  const skipValidationForFields =
    /^\/api\/v1\/workspaces\/[^/]+\/whiteboards\/[^/]+$/.test(
      req.nextUrl.pathname
    )
      ? ['snapshot']
      : undefined;

  return (
    (await validateRequestEmojiLimit(req, {
      allowDescriptionYjsState,
      skipValidationForFields,
    })) ?? null
  );
}
