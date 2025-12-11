/**
 * Email Service Constants
 *
 * Rate limiting thresholds, Redis keys, and configuration values.
 */

import type { RateLimitConfig } from './types';

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

/**
 * Default rate limits for email sending.
 * These can be overridden per-workspace via workspace_secrets.
 */
export const EMAIL_RATE_LIMITS: RateLimitConfig = {
  // General email limits per workspace
  workspacePerMinute: 50,
  workspacePerHour: 500,
  workspacePerDay: 5000,

  // Per-user limits (authenticated sender)
  userPerMinute: 10,
  userPerHour: 100,

  // Per-recipient limits (prevent spam to single address)
  recipientPerHour: 5,
  recipientPerDay: 20,

  // Per-IP limits (for API calls)
  ipPerMinute: 20,
  ipPerHour: 200,

  // Stricter limits for workspace invites (prevent invite spam)
  invitePerMinute: 10,
  invitePerHour: 100,
  invitePerDay: 500,
} as const;

// =============================================================================
// Time Windows (in milliseconds)
// =============================================================================

export const EMAIL_WINDOW_MS = {
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,
} as const;

// =============================================================================
// Redis Key Prefixes
// =============================================================================

/**
 * Redis key generators for email rate limiting.
 * All keys are namespaced under 'email:' to avoid collisions.
 */
export const EMAIL_REDIS_KEYS = {
  // Workspace rate limits
  WS_EMAIL_MINUTE: (wsId: string) => `email:ws:min:${wsId}`,
  WS_EMAIL_HOUR: (wsId: string) => `email:ws:hr:${wsId}`,
  WS_EMAIL_DAY: (wsId: string) => `email:ws:day:${wsId}`,

  // User rate limits
  USER_EMAIL_MINUTE: (userId: string) => `email:user:min:${userId}`,
  USER_EMAIL_HOUR: (userId: string) => `email:user:hr:${userId}`,

  // Recipient rate limits (hash email for privacy)
  RECIPIENT_HOUR: (emailHash: string) => `email:rcpt:hr:${emailHash}`,
  RECIPIENT_DAY: (emailHash: string) => `email:rcpt:day:${emailHash}`,

  // IP rate limits
  IP_MINUTE: (ip: string) => `email:ip:min:${ip}`,
  IP_HOUR: (ip: string) => `email:ip:hr:${ip}`,

  // Invite-specific rate limits
  WS_INVITE_MINUTE: (wsId: string) => `email:invite:min:${wsId}`,
  WS_INVITE_HOUR: (wsId: string) => `email:invite:hr:${wsId}`,
  WS_INVITE_DAY: (wsId: string) => `email:invite:day:${wsId}`,

  // Bounce tracking (per email hash)
  BOUNCE_COUNT: (emailHash: string) => `email:bounce:${emailHash}`,
  COMPLAINT_COUNT: (emailHash: string) => `email:complaint:${emailHash}`,

  // Reputation cache
  EMAIL_REPUTATION: (emailHash: string) => `email:rep:${emailHash}`,
} as const;

// =============================================================================
// Bounce & Complaint Thresholds
// =============================================================================

export const EMAIL_REPUTATION_THRESHOLDS = {
  /** Soft bounce count before suspending delivery */
  SOFT_BOUNCE_SUSPEND_COUNT: 3,
  /** Block immediately after hard bounce */
  HARD_BOUNCE_BLOCK_IMMEDIATELY: true,
  /** Complaint count before blocking */
  COMPLAINT_BLOCK_COUNT: 1,
  /** Days to track bounces for reputation */
  BOUNCE_WINDOW_DAYS: 30,
  /** Days to track complaints for reputation */
  COMPLAINT_WINDOW_DAYS: 90,
} as const;

// =============================================================================
// Email Validation
// =============================================================================

/**
 * Basic email validation regex.
 * More comprehensive validation should use the blacklist checker.
 */
export const EMAIL_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Maximum recipients per email send.
 * SES limits to 50 recipients per call; we use a lower limit for safety.
 */
export const MAX_RECIPIENTS_PER_EMAIL = 50;

/**
 * Maximum subject length (RFC 5321 recommends 78 chars, but allow up to 200)
 */
export const MAX_SUBJECT_LENGTH = 200;

// =============================================================================
// Provider Configuration
// =============================================================================

export const SES_DEFAULT_REGION = 'ap-southeast-1';

/**
 * Workspace secrets keys for custom rate limits.
 * These can be set per-workspace to override defaults.
 */
export const WORKSPACE_SECRET_KEYS = {
  EMAIL_RATE_LIMIT_MINUTE: 'EMAIL_RATE_LIMIT_MINUTE',
  EMAIL_RATE_LIMIT_HOUR: 'EMAIL_RATE_LIMIT_HOUR',
  EMAIL_RATE_LIMIT_DAY: 'EMAIL_RATE_LIMIT_DAY',
  INVITE_RATE_LIMIT_MINUTE: 'INVITE_RATE_LIMIT_MINUTE',
  INVITE_RATE_LIMIT_HOUR: 'INVITE_RATE_LIMIT_HOUR',
  INVITE_RATE_LIMIT_DAY: 'INVITE_RATE_LIMIT_DAY',
} as const;

// =============================================================================
// Audit Configuration
// =============================================================================

/**
 * Whether to store full email content in audit logs.
 * Default is false for privacy; set to true for debugging.
 */
export const STORE_EMAIL_CONTENT_DEFAULT = false;

/**
 * Email audit record retention period (days).
 * Records older than this may be cleaned up.
 */
export const AUDIT_RETENTION_DAYS = 90;
