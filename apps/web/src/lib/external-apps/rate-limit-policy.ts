import type { RateLimitConfig } from '@/lib/rate-limit';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Limits for the external-app API surface. Each workspace-route bucket is
 * counted per app and user, and also per app and workspace when the bearer is
 * bound to the requested workspace (upload URLs per app and user only). The
 * app-token exchange is counted per app and client IP, or per app alone when
 * no trusted client IP is known.
 */
export const EXTERNAL_APP_RATE_LIMITS = {
  read: { windowMs: MINUTE_MS, maxRequests: 600 },
  write: { windowMs: MINUTE_MS, maxRequests: 60 },
  uploadUrl: { windowMs: MINUTE_MS, maxRequests: 10 },
  invitation: { windowMs: HOUR_MS, maxRequests: 5 },
  exchange: { windowMs: MINUTE_MS, maxRequests: 30 },
  exchangeUnknownIp: { windowMs: MINUTE_MS, maxRequests: 300 },
} as const satisfies Record<string, RateLimitConfig>;

export type ExternalAppRateLimitBucket = keyof typeof EXTERNAL_APP_RATE_LIMITS;

export const EXTERNAL_APP_RATE_LIMITED_CODE = 'RATE_LIMIT_EXCEEDED';
export const EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_CODE =
  'RATE_LIMIT_UNAVAILABLE';
/** Seconds a client waits before retrying while the limiter is down. */
export const EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS = 30;
