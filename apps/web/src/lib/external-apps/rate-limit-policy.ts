import type { RateLimitConfig } from '@/lib/rate-limit';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Limits for the external-app API surface.
 *
 * Workspace routes count every request per app and user. A bearer bound to
 * the requested workspace that holds the route's scopes also counts per app
 * and workspace; those caps sit above the per-user caps so one member cannot
 * spend a whole workspace's budget alone.
 *
 * The app-token exchange admits at most `exchangeAttempt` per app and client
 * IP before any credential check (`exchangeUnknownIp` per app when no trusted
 * IP is known), paces failed app secrets and failed handoff or refresh
 * tokens per app and IP, and counts token exchanges of a verified app at
 * `exchange` per app.
 */
export const EXTERNAL_APP_RATE_LIMITS = {
  userRead: { windowMs: MINUTE_MS, maxRequests: 300 },
  userWrite: { windowMs: MINUTE_MS, maxRequests: 30 },
  userUploadUrl: { windowMs: MINUTE_MS, maxRequests: 10 },
  userInvitation: { windowMs: HOUR_MS, maxRequests: 5 },
  workspaceRead: { windowMs: MINUTE_MS, maxRequests: 600 },
  workspaceWrite: { windowMs: MINUTE_MS, maxRequests: 60 },
  workspaceInvitation: { windowMs: HOUR_MS, maxRequests: 30 },
  exchangeAttempt: { windowMs: MINUTE_MS, maxRequests: 600 },
  exchangeUnknownIp: { windowMs: MINUTE_MS, maxRequests: 300 },
  exchangeSecretFailure: { windowMs: MINUTE_MS, maxRequests: 30 },
  exchangeTokenFailure: { windowMs: MINUTE_MS, maxRequests: 30 },
  exchange: { windowMs: MINUTE_MS, maxRequests: 600 },
} as const satisfies Record<string, RateLimitConfig>;

export type ExternalAppRateLimitBucket = keyof typeof EXTERNAL_APP_RATE_LIMITS;

export const EXTERNAL_APP_RATE_LIMITED_CODE = 'RATE_LIMIT_EXCEEDED';
export const EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_CODE =
  'RATE_LIMIT_UNAVAILABLE';
/** Seconds a client waits before retrying while the limiter is down. */
export const EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS = 30;
