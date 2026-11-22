import type { RateLimitConfig } from '@/lib/rate-limit';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Limits for the external-app API surface. Workspace routes are counted per
 * app and workspace (upload URLs per app and user); the app-token exchange is
 * counted per app and client IP.
 */
export const EXTERNAL_APP_RATE_LIMITS = {
  read: { windowMs: MINUTE_MS, maxRequests: 600 },
  write: { windowMs: MINUTE_MS, maxRequests: 60 },
  uploadUrl: { windowMs: MINUTE_MS, maxRequests: 10 },
  invitation: { windowMs: HOUR_MS, maxRequests: 5 },
  exchange: { windowMs: MINUTE_MS, maxRequests: 30 },
} as const satisfies Record<string, RateLimitConfig>;

export type ExternalAppRateLimitBucket = keyof typeof EXTERNAL_APP_RATE_LIMITS;

export const EXTERNAL_APP_RATE_LIMITED_CODE = 'RATE_LIMIT_EXCEEDED';
export const EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_CODE =
  'RATE_LIMIT_UNAVAILABLE';
/** Seconds a client waits before retrying while the limiter is down. */
export const EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS = 30;
