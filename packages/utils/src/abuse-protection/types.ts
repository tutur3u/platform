/**
 * Types for OTP Abuse Protection System
 */

export type AbuseEventType =
  | 'otp_send'
  | 'otp_verify_failed'
  | 'mfa_challenge'
  | 'mfa_verify_failed'
  | 'reauth_send'
  | 'reauth_verify_failed'
  | 'password_login_failed'
  | 'api_auth_failed'
  | 'api_rate_limited'
  | 'api_abuse'
  | 'manual';

export type IPBlockStatus = 'active' | 'expired' | 'manually_unblocked';

export interface AbuseCheckResult {
  allowed: boolean;
  blocked?: boolean;
  reason?: string;
  retryAfter?: number; // seconds until retry allowed
  remainingAttempts?: number;
}

export interface BlockInfo {
  id: string;
  blockLevel: number;
  reason: AbuseEventType;
  expiresAt: Date;
  blockedAt: Date;
}

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

export interface LogAbuseEventOptions {
  email?: string;
  userAgent?: string;
  endpoint?: string;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

export interface BlockedIP {
  id: string;
  ip_address: string;
  reason: AbuseEventType;
  block_level: number;
  status: IPBlockStatus;
  blocked_at: string;
  expires_at: string;
  unblocked_at?: string;
  unblocked_by?: string;
  unblock_reason?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AbuseEvent {
  id: string;
  ip_address: string;
  event_type: AbuseEventType;
  email?: string;
  email_hash?: string;
  user_agent?: string;
  endpoint?: string;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}
