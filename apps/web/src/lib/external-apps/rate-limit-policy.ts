import type { RateLimitConfig } from '@/lib/rate-limit';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Limits for the external-app API surface.
 *
 * Workspace routes count every request per app and user. A bearer bound to
 * the requested workspace that holds the route's scopes also counts per app
 * and workspace; those caps sit above the per-user caps so one member cannot
 * spend a whole workspace's budget alone. Running a cron job now is also
 * counted per app, workspace and job (`runNowMinute`, `runNowHour`).
 *
 * The app-token exchange admits at most `exchangeAttempt` per app and keyed
 * digest of the presented secret before the secret is checked, answers 429
 * to failed app secrets and failed handoff or refresh tokens past their
 * per-app and per-IP limits, and counts token exchanges of a verified app at
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
  runNowMinute: { windowMs: MINUTE_MS, maxRequests: 1 },
  runNowHour: { windowMs: HOUR_MS, maxRequests: 10 },
  exchangeAttempt: { windowMs: MINUTE_MS, maxRequests: 600 },
  exchangeSecretFailure: { windowMs: MINUTE_MS, maxRequests: 30 },
  exchangeTokenFailure: { windowMs: MINUTE_MS, maxRequests: 30 },
  exchange: { windowMs: MINUTE_MS, maxRequests: 600 },
  // Account-link routes (link, unlink, introspect): per client IP and per
  // app plus secret digest before credentials are checked, per verified app
  // after, and per user for link writes.
  accountLinkIp: { windowMs: MINUTE_MS, maxRequests: 120 },
  accountLinkAttempt: { windowMs: MINUTE_MS, maxRequests: 600 },
  accountLinkApp: { windowMs: MINUTE_MS, maxRequests: 600 },
  accountLinkUser: { windowMs: MINUTE_MS, maxRequests: 10 },
} as const satisfies Record<string, RateLimitConfig>;

export type ExternalAppRateLimitBucket = keyof typeof EXTERNAL_APP_RATE_LIMITS;

export const EXTERNAL_APP_RATE_LIMITED_CODE = 'RATE_LIMIT_EXCEEDED';
export const EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_CODE =
  'RATE_LIMIT_UNAVAILABLE';
/** Seconds a client waits before retrying while the limiter is down. */
export const EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS = 30;
