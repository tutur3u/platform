/**
 * Configuration constants for OTP Abuse Protection System
 */

/**
 * Rate limiting thresholds for different operations
 */
export const ABUSE_THRESHOLDS = {
  // OTP Send limits
  OTP_SEND_PER_MINUTE: 3,
  OTP_SEND_PER_HOUR: 10,
  OTP_SEND_PER_DAY: 12,
  OTP_SEND_EMAIL_COOLDOWN_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  OTP_SEND_EMAIL_PER_HOUR: 2,
  OTP_SEND_EMAIL_PER_DAY: 4,

  // OTP Verify limits (per IP)
  OTP_VERIFY_FAILED_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  OTP_VERIFY_FAILED_MAX: 5,

  // OTP Verify limits (per email - distributed attack protection)
  OTP_VERIFY_FAILED_EMAIL_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  OTP_VERIFY_FAILED_EMAIL_MAX: 10,

  // MFA limits
  MFA_CHALLENGE_PER_MINUTE: 5,
  MFA_VERIFY_FAILED_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  MFA_VERIFY_FAILED_MAX: 5,

  // Reauth limits
  REAUTH_SEND_PER_MINUTE: 3,
  REAUTH_VERIFY_FAILED_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  REAUTH_VERIFY_FAILED_MAX: 5,

  // Password login limits
  PASSWORD_LOGIN_FAILED_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  PASSWORD_LOGIN_FAILED_MAX: 10,

  // API auth failure limits (session-auth routes)
  API_AUTH_FAILED_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  API_AUTH_FAILED_MAX: 20, // 20 failed auths in 5 min → auto-block IP
} as const;

/**
 * Progressive block durations in seconds
 * Level increases with repeated offenses within 24 hours
 */
export const BLOCK_DURATIONS: Record<1 | 2 | 3 | 4, number> = {
  1: 5 * 60, // Level 1: 5 minutes
  2: 15 * 60, // Level 2: 15 minutes
  3: 60 * 60, // Level 3: 1 hour
  4: 24 * 60 * 60, // Level 4: 24 hours
} as const;

/**
 * Maximum block level
 */
export const MAX_BLOCK_LEVEL = 4;

/**
 * Redis key prefixes for rate limiting
 */
export const REDIS_KEYS = {
  // OTP Send attempts per IP (sliding window)
  OTP_SEND: (ip: string) => `otp:send:${ip}`,
  OTP_SEND_HOURLY: (ip: string) => `otp:send:hourly:${ip}`,
  OTP_SEND_DAILY: (ip: string) => `otp:send:daily:${ip}`,
  OTP_SEND_EMAIL_COOLDOWN: (emailHash: string) =>
    `otp:send:email:cooldown:${emailHash}`,
  OTP_SEND_EMAIL_HOURLY: (emailHash: string) =>
    `otp:send:email:hourly:${emailHash}`,
  OTP_SEND_EMAIL_DAILY: (emailHash: string) =>
    `otp:send:email:daily:${emailHash}`,

  // OTP Verify failed attempts
  OTP_VERIFY_FAILED: (ip: string) => `otp:verify:failed:${ip}`,
  OTP_VERIFY_FAILED_EMAIL: (emailHash: string) =>
    `otp:verify:failed:email:${emailHash}`,

  // MFA attempts
  MFA_CHALLENGE: (ip: string) => `mfa:challenge:${ip}`,
  MFA_VERIFY_FAILED: (ip: string) => `mfa:verify:failed:${ip}`,

  // Reauth attempts
  REAUTH_SEND: (ip: string) => `reauth:send:${ip}`,
  REAUTH_VERIFY_FAILED: (ip: string) => `reauth:verify:failed:${ip}`,

  // Password login attempts
  PASSWORD_LOGIN_FAILED: (ip: string) => `password:login:failed:${ip}`,

  // API auth failure attempts (session-auth routes)
  API_AUTH_FAILED: (ip: string) => `api:auth:failed:${ip}`,

  // IP block cache
  IP_BLOCKED: (ip: string) => `ip:blocked:${ip}`,
  IP_BLOCK_LEVEL: (ip: string) => `ip:block:level:${ip}`,
} as const;

/**
 * Window durations in milliseconds for different operations
 */
export const WINDOW_MS = {
  ONE_MINUTE: 60 * 1000,
  TEN_MINUTES: 10 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  TWENTY_FOUR_HOURS: 24 * 60 * 60 * 1000,
} as const;
