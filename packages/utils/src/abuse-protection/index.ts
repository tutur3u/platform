/**
 * OTP Abuse Protection System
 *
 * Provides rate limiting and IP blocking for OTP-related operations
 * to prevent brute force attacks and enumeration.
 */

import { createHash } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import { getUpstashRestRedisClient, hasUpstashRestEnv } from '../upstash-rest';
import {
  ABUSE_THRESHOLDS,
  BLOCK_DURATIONS,
  MAX_BLOCK_LEVEL,
  REDIS_KEYS,
  WINDOW_MS,
} from './constants';
import type { AbuseCheckResult, AbuseEventType, BlockInfo } from './types';

// Re-export types and constants
export * from './constants';
export * from './types';

// In-memory fallback store
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

// Redis client singleton (lazy initialized)
let redisClient: Redis | null = null;
let redisInitialized = false;

/**
 * Initialize Redis client from Upstash environment variables
 */
async function getRedisClient(): Promise<Redis | null> {
  if (redisInitialized) return redisClient;

  try {
    if (!hasUpstashRestEnv()) {
      console.warn(
        '[Abuse Protection] Redis not configured - falling back to memory'
      );
      redisInitialized = true;
      return null;
    }

    redisClient = await getUpstashRestRedisClient();
    redisInitialized = true;
    return redisClient;
  } catch (error) {
    console.warn('[Abuse Protection] Redis unavailable:', error);
    redisInitialized = true;
    return null;
  }
}

/**
 * Validate IP address format
 */
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Extract client IP address from request headers
 * Works with Next.js headers() in Server Actions
 */
export function extractIPFromHeaders(
  headers: Headers | Map<string, string> | Record<string, string | null>
): string {
  const getHeader = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    if (headers instanceof Map) {
      return headers.get(name) || null;
    }
    return headers[name] || null;
  };

  // Check cf-connecting-ip (Cloudflare)
  const cfIP = getHeader('cf-connecting-ip');
  if (cfIP && isValidIP(cfIP)) {
    return cfIP;
  }

  // Check true-client-ip (some Cloudflare/enterprise proxy setups)
  const trueClientIP = getHeader('true-client-ip');
  if (trueClientIP && isValidIP(trueClientIP)) {
    return trueClientIP;
  }

  // Check x-forwarded-for after explicit client IP headers
  const forwardedFor = getHeader('x-forwarded-for');
  if (forwardedFor) {
    const firstIP = forwardedFor.split(',')[0]?.trim();
    if (firstIP && isValidIP(firstIP)) {
      return firstIP;
    }
  }

  // Check x-real-ip (Nginx)
  const realIP = getHeader('x-real-ip');
  if (realIP && isValidIP(realIP)) {
    return realIP;
  }

  return 'unknown';
}

/**
 * Hash email for privacy when storing in logs
 */
export function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Increment a counter in Redis or memory with automatic expiration
 */
async function incrementCounter(
  key: string,
  windowMs: number
): Promise<{ count: number; ttl: number }> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }
      const ttl = await redis.ttl(key);
      return { count, ttl: ttl > 0 ? ttl : Math.ceil(windowMs / 1000) };
    } catch (error) {
      console.error('[Abuse Protection] Redis error:', error);
      // Fall through to memory
    }
  }

  // Memory fallback
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || now > existing.expiresAt) {
    memoryStore.set(key, { count: 1, expiresAt: now + windowMs });
    return { count: 1, ttl: Math.ceil(windowMs / 1000) };
  }

  existing.count++;
  return {
    count: existing.count,
    ttl: Math.ceil((existing.expiresAt - now) / 1000),
  };
}

/**
 * Get counter value from Redis or memory
 */
async function getCounter(key: string): Promise<number> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const count = await redis.get<number>(key);
      return count || 0;
    } catch {
      // Fall through to memory
    }
  }

  const existing = memoryStore.get(key);
  if (!existing || Date.now() > existing.expiresAt) {
    return 0;
  }
  return existing.count;
}

/**
 * Delete keys from Redis or memory
 */
async function deleteKeys(...keys: string[]): Promise<void> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      await redis.del(...keys);
      return;
    } catch {
      // Fall through to memory
    }
  }

  for (const key of keys) {
    memoryStore.delete(key);
  }
}

/**
 * Check if an IP is currently blocked
 */
export async function isIPBlocked(
  ipAddress: string
): Promise<BlockInfo | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const cached = await redis.get<string>(REDIS_KEYS.IP_BLOCKED(ipAddress));
    if (!cached) return null;

    const blockInfo = typeof cached === 'string' ? JSON.parse(cached) : cached;
    if (new Date(blockInfo.expiresAt) <= new Date()) return null;

    return {
      id: blockInfo.id,
      blockLevel: blockInfo.level,
      reason: blockInfo.reason,
      expiresAt: new Date(blockInfo.expiresAt),
      blockedAt: new Date(blockInfo.blockedAt),
    };
  } catch {
    // Fail-open: if Redis is unavailable, allow request through
    return null;
  }
}

/**
 * Block an IP address with progressive duration
 */
export async function blockIP(
  ipAddress: string,
  reason: AbuseEventType
): Promise<void> {
  try {
    const redis = await getRedisClient();

    // Get current block level
    let currentLevel = 0;
    if (redis) {
      try {
        const level = await redis.get<number>(
          REDIS_KEYS.IP_BLOCK_LEVEL(ipAddress)
        );
        currentLevel = level || 0;
      } catch (error) {
        console.error(
          '[Abuse Protection] Error fetching IP block level:',
          error
        );
      }
    }

    // Calculate new block level (max 4)
    const newLevel = Math.min(currentLevel + 1, MAX_BLOCK_LEVEL) as
      | 1
      | 2
      | 3
      | 4;
    const blockDuration = BLOCK_DURATIONS[newLevel];
    const expiresAt = new Date(Date.now() + blockDuration * 1000);

    // Update Redis cache
    if (redis) {
      await Promise.all([
        redis.set(
          REDIS_KEYS.IP_BLOCKED(ipAddress),
          JSON.stringify({
            level: newLevel,
            reason,
            expiresAt: expiresAt.toISOString(),
            blockedAt: new Date().toISOString(),
          }),
          { ex: blockDuration }
        ),
        redis.set(REDIS_KEYS.IP_BLOCK_LEVEL(ipAddress), newLevel, {
          ex: WINDOW_MS.TWENTY_FOUR_HOURS / 1000,
        }),
      ]);
    }

    console.log(
      `[Abuse Protection] Blocked IP ${ipAddress} at level ${newLevel} for ${blockDuration}s due to ${reason}`
    );
  } catch (error) {
    console.error('[Abuse Protection] Error blocking IP:', error);
  }
}

/**
 * Manually unblock an IP address
 */
export async function unblockIP(
  ipAddress: string,
  unblockingUserId: string
): Promise<boolean> {
  try {
    const redis = await getRedisClient();

    // Clear Redis cache
    if (redis) {
      await deleteKeys(
        REDIS_KEYS.IP_BLOCKED(ipAddress),
        REDIS_KEYS.IP_BLOCK_LEVEL(ipAddress)
      );
    }

    console.log(
      `[Abuse Protection] Unblocked IP ${ipAddress} by user ${unblockingUserId}`
    );
    return true;
  } catch (error) {
    console.error('[Abuse Protection] Error unblocking IP:', error);
    return false;
  }
}

/**
 * Check and track OTP send attempts
 */
export async function checkOTPSendLimit(
  ipAddress: string,
  email?: string
): Promise<AbuseCheckResult> {
  // First check if IP is blocked
  const blockInfo = await isIPBlocked(ipAddress);
  if (blockInfo) {
    const retryAfter = Math.ceil(
      (blockInfo.expiresAt.getTime() - Date.now()) / 1000
    );
    return {
      allowed: false,
      blocked: true,
      reason: `IP blocked due to ${blockInfo.reason}. Block level: ${blockInfo.blockLevel}`,
      retryAfter,
    };
  }

  // Check per-minute limit
  const minuteKey = REDIS_KEYS.OTP_SEND(ipAddress);
  const { count: minuteCount, ttl: minuteTTL } = await incrementCounter(
    minuteKey,
    WINDOW_MS.ONE_MINUTE
  );

  if (minuteCount > ABUSE_THRESHOLDS.OTP_SEND_PER_MINUTE) {
    if (minuteCount > ABUSE_THRESHOLDS.OTP_SEND_PER_MINUTE * 2) {
      // Aggressive abuse - block IP
      void blockIP(ipAddress, 'otp_send');
    }

    return {
      allowed: false,
      reason: 'Too many OTP requests. Please try again later.',
      retryAfter: minuteTTL,
      remainingAttempts: 0,
    };
  }

  // Check hourly limit
  const hourlyKey = REDIS_KEYS.OTP_SEND_HOURLY(ipAddress);
  const { count: hourlyCount, ttl: hourlyTTL } = await incrementCounter(
    hourlyKey,
    WINDOW_MS.ONE_HOUR
  );

  if (hourlyCount > ABUSE_THRESHOLDS.OTP_SEND_PER_HOUR) {
    void blockIP(ipAddress, 'otp_send');

    return {
      allowed: false,
      reason: 'Hourly OTP limit reached. Please try again later.',
      retryAfter: hourlyTTL,
      remainingAttempts: 0,
    };
  }

  const dailyKey = REDIS_KEYS.OTP_SEND_DAILY(ipAddress);
  const { count: dailyCount, ttl: dailyTTL } = await incrementCounter(
    dailyKey,
    WINDOW_MS.TWENTY_FOUR_HOURS
  );

  if (dailyCount > ABUSE_THRESHOLDS.OTP_SEND_PER_DAY) {
    void blockIP(ipAddress, 'otp_send');

    return {
      allowed: false,
      reason: 'OTP limit reached. Please try again later.',
      retryAfter: dailyTTL,
      remainingAttempts: 0,
    };
  }

  if (email) {
    const emailHash = hashEmail(email);

    const cooldownKey = REDIS_KEYS.OTP_SEND_EMAIL_COOLDOWN(emailHash);
    const { count: cooldownCount, ttl: cooldownTTL } = await incrementCounter(
      cooldownKey,
      ABUSE_THRESHOLDS.OTP_SEND_EMAIL_COOLDOWN_WINDOW_MS
    );

    if (cooldownCount > 1) {
      return {
        allowed: false,
        reason: 'Too many OTP requests. Please try again later.',
        retryAfter: cooldownTTL,
        remainingAttempts: 0,
      };
    }

    const hourlyEmailKey = REDIS_KEYS.OTP_SEND_EMAIL_HOURLY(emailHash);
    const { count: hourlyEmailCount, ttl: hourlyEmailTTL } =
      await incrementCounter(hourlyEmailKey, WINDOW_MS.ONE_HOUR);

    if (hourlyEmailCount > ABUSE_THRESHOLDS.OTP_SEND_EMAIL_PER_HOUR) {
      return {
        allowed: false,
        reason: 'Hourly OTP limit reached. Please try again later.',
        retryAfter: hourlyEmailTTL,
        remainingAttempts: 0,
      };
    }

    const dailyEmailKey = REDIS_KEYS.OTP_SEND_EMAIL_DAILY(emailHash);
    const { count: dailyEmailCount, ttl: dailyEmailTTL } =
      await incrementCounter(dailyEmailKey, WINDOW_MS.TWENTY_FOUR_HOURS);

    if (dailyEmailCount > ABUSE_THRESHOLDS.OTP_SEND_EMAIL_PER_DAY) {
      return {
        allowed: false,
        reason: 'OTP limit reached. Please try again later.',
        retryAfter: dailyEmailTTL,
        remainingAttempts: 0,
      };
    }
  }

  return {
    allowed: true,
    remainingAttempts: ABUSE_THRESHOLDS.OTP_SEND_PER_MINUTE - minuteCount,
  };
}

/**
 * Check if OTP verification is allowed
 */
export async function checkOTPVerifyLimit(
  ipAddress: string,
  email: string
): Promise<AbuseCheckResult> {
  // First check if IP is blocked
  const blockInfo = await isIPBlocked(ipAddress);
  if (blockInfo) {
    const retryAfter = Math.ceil(
      (blockInfo.expiresAt.getTime() - Date.now()) / 1000
    );
    return {
      allowed: false,
      blocked: true,
      reason: `IP blocked due to ${blockInfo.reason}`,
      retryAfter,
    };
  }

  // Get current counts (don't increment yet - increment on failure)
  const ipKey = REDIS_KEYS.OTP_VERIFY_FAILED(ipAddress);
  const emailKey = REDIS_KEYS.OTP_VERIFY_FAILED_EMAIL(hashEmail(email));

  const [ipCount, emailCount] = await Promise.all([
    getCounter(ipKey),
    getCounter(emailKey),
  ]);

  if (ipCount >= ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_MAX) {
    return {
      allowed: false,
      reason: 'Too many failed verification attempts from this IP',
      retryAfter: Math.ceil(
        ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_WINDOW_MS / 1000
      ),
      remainingAttempts: 0,
    };
  }

  if (emailCount >= ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_EMAIL_MAX) {
    return {
      allowed: false,
      reason: 'Too many failed verification attempts for this email',
      retryAfter: Math.ceil(
        ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_EMAIL_WINDOW_MS / 1000
      ),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    remainingAttempts: ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_MAX - ipCount,
  };
}

/**
 * Record a failed OTP verification attempt
 */
export async function recordOTPVerifyFailure(
  ipAddress: string,
  email: string
): Promise<void> {
  const ipKey = REDIS_KEYS.OTP_VERIFY_FAILED(ipAddress);
  const emailKey = REDIS_KEYS.OTP_VERIFY_FAILED_EMAIL(hashEmail(email));

  const [{ count: ipCount }] = await Promise.all([
    incrementCounter(ipKey, ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_WINDOW_MS),
    incrementCounter(
      emailKey,
      ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_EMAIL_WINDOW_MS
    ),
  ]);

  // Block if threshold exceeded
  if (ipCount >= ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_MAX) {
  }
}

/**
 * Clear failed attempts on successful verification
 */
export async function clearOTPVerifyFailures(
  ipAddress: string,
  email: string
): Promise<void> {
  await deleteKeys(
    REDIS_KEYS.OTP_VERIFY_FAILED(ipAddress),
    REDIS_KEYS.OTP_VERIFY_FAILED_EMAIL(hashEmail(email))
  );
}

/**
 * Check and track MFA challenge attempts
 */
export async function checkMFAChallengeLimit(
  ipAddress: string
): Promise<AbuseCheckResult> {
  const blockInfo = await isIPBlocked(ipAddress);
  if (blockInfo) {
    return {
      allowed: false,
      blocked: true,
      reason: `IP blocked due to ${blockInfo.reason}`,
      retryAfter: Math.ceil(
        (blockInfo.expiresAt.getTime() - Date.now()) / 1000
      ),
    };
  }

  const key = REDIS_KEYS.MFA_CHALLENGE(ipAddress);
  const { count, ttl } = await incrementCounter(key, WINDOW_MS.ONE_MINUTE);

  if (count > ABUSE_THRESHOLDS.MFA_CHALLENGE_PER_MINUTE) {
    return {
      allowed: false,
      reason: 'Too many MFA challenge requests',
      retryAfter: ttl,
      remainingAttempts: 0,
    };
  }

  return { allowed: true };
}

/**
 * Check if MFA verification is allowed
 */
export async function checkMFAVerifyLimit(
  ipAddress: string
): Promise<AbuseCheckResult> {
  const blockInfo = await isIPBlocked(ipAddress);
  if (blockInfo) {
    return {
      allowed: false,
      blocked: true,
      reason: `IP blocked due to ${blockInfo.reason}`,
      retryAfter: Math.ceil(
        (blockInfo.expiresAt.getTime() - Date.now()) / 1000
      ),
    };
  }

  const key = REDIS_KEYS.MFA_VERIFY_FAILED(ipAddress);
  const count = await getCounter(key);

  if (count >= ABUSE_THRESHOLDS.MFA_VERIFY_FAILED_MAX) {
    return {
      allowed: false,
      reason: 'Too many failed MFA verification attempts',
      retryAfter: Math.ceil(
        ABUSE_THRESHOLDS.MFA_VERIFY_FAILED_WINDOW_MS / 1000
      ),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    remainingAttempts: ABUSE_THRESHOLDS.MFA_VERIFY_FAILED_MAX - count,
  };
}

/**
 * Record a failed MFA verification attempt
 */
export async function recordMFAVerifyFailure(ipAddress: string): Promise<void> {
  const key = REDIS_KEYS.MFA_VERIFY_FAILED(ipAddress);
  const { count } = await incrementCounter(
    key,
    ABUSE_THRESHOLDS.MFA_VERIFY_FAILED_WINDOW_MS
  );

  if (count >= ABUSE_THRESHOLDS.MFA_VERIFY_FAILED_MAX) {
    void blockIP(ipAddress, 'mfa_verify_failed');
  }
}

/**
 * Clear MFA failures on success
 */
export async function clearMFAVerifyFailures(ipAddress: string): Promise<void> {
  await deleteKeys(REDIS_KEYS.MFA_VERIFY_FAILED(ipAddress));
}

/**
 * Check reauthentication send limits
 */
export async function checkReauthSendLimit(
  ipAddress: string
): Promise<AbuseCheckResult> {
  const blockInfo = await isIPBlocked(ipAddress);
  if (blockInfo) {
    return {
      allowed: false,
      blocked: true,
      reason: `IP blocked due to ${blockInfo.reason}`,
      retryAfter: Math.ceil(
        (blockInfo.expiresAt.getTime() - Date.now()) / 1000
      ),
    };
  }

  const key = REDIS_KEYS.REAUTH_SEND(ipAddress);
  const { count, ttl } = await incrementCounter(key, WINDOW_MS.ONE_MINUTE);

  if (count > ABUSE_THRESHOLDS.REAUTH_SEND_PER_MINUTE) {
    return {
      allowed: false,
      reason: 'Too many reauthentication requests',
      retryAfter: ttl,
      remainingAttempts: 0,
    };
  }

  return { allowed: true };
}

/**
 * Check reauthentication verify limits
 */
export async function checkReauthVerifyLimit(
  ipAddress: string
): Promise<AbuseCheckResult> {
  const blockInfo = await isIPBlocked(ipAddress);
  if (blockInfo) {
    return {
      allowed: false,
      blocked: true,
      reason: `IP blocked due to ${blockInfo.reason}`,
      retryAfter: Math.ceil(
        (blockInfo.expiresAt.getTime() - Date.now()) / 1000
      ),
    };
  }

  const key = REDIS_KEYS.REAUTH_VERIFY_FAILED(ipAddress);
  const count = await getCounter(key);

  if (count >= ABUSE_THRESHOLDS.REAUTH_VERIFY_FAILED_MAX) {
    return {
      allowed: false,
      reason: 'Too many failed reauthentication attempts',
      retryAfter: Math.ceil(
        ABUSE_THRESHOLDS.REAUTH_VERIFY_FAILED_WINDOW_MS / 1000
      ),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    remainingAttempts: ABUSE_THRESHOLDS.REAUTH_VERIFY_FAILED_MAX - count,
  };
}

/**
 * Record failed reauthentication
 */
export async function recordReauthVerifyFailure(
  ipAddress: string
): Promise<void> {
  const key = REDIS_KEYS.REAUTH_VERIFY_FAILED(ipAddress);
  const { count } = await incrementCounter(
    key,
    ABUSE_THRESHOLDS.REAUTH_VERIFY_FAILED_WINDOW_MS
  );

  if (count >= ABUSE_THRESHOLDS.REAUTH_VERIFY_FAILED_MAX) {
    void blockIP(ipAddress, 'reauth_verify_failed');
  }
}

/**
 * Clear reauth failures on success
 */
export async function clearReauthVerifyFailures(
  ipAddress: string
): Promise<void> {
  await deleteKeys(REDIS_KEYS.REAUTH_VERIFY_FAILED(ipAddress));
}

/**
 * Check password login limits
 */
export async function checkPasswordLoginLimit(
  ipAddress: string
): Promise<AbuseCheckResult> {
  const blockInfo = await isIPBlocked(ipAddress);
  if (blockInfo) {
    return {
      allowed: false,
      blocked: true,
      reason: `IP blocked due to ${blockInfo.reason}`,
      retryAfter: Math.ceil(
        (blockInfo.expiresAt.getTime() - Date.now()) / 1000
      ),
    };
  }

  const key = REDIS_KEYS.PASSWORD_LOGIN_FAILED(ipAddress);
  const count = await getCounter(key);

  if (count >= ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_MAX) {
    return {
      allowed: false,
      reason: 'Too many failed login attempts',
      retryAfter: Math.ceil(
        ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_WINDOW_MS / 1000
      ),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    remainingAttempts: ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_MAX - count,
  };
}

/**
 * Record failed password login
 */
export async function recordPasswordLoginFailure(
  ipAddress: string
): Promise<void> {
  const key = REDIS_KEYS.PASSWORD_LOGIN_FAILED(ipAddress);
  const { count } = await incrementCounter(
    key,
    ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_WINDOW_MS
  );

  if (count >= ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_MAX) {
    void blockIP(ipAddress, 'password_login_failed');
  }
}

/**
 * Clear password login failures on success
 */
export async function clearPasswordLoginFailures(
  ipAddress: string
): Promise<void> {
  await deleteKeys(REDIS_KEYS.PASSWORD_LOGIN_FAILED(ipAddress));
}

/**
 * Check if an IP should be blocked for API auth abuse
 */
export async function checkApiAuthLimit(
  ipAddress: string
): Promise<AbuseCheckResult> {
  const blockInfo = await isIPBlocked(ipAddress);
  if (blockInfo) {
    return {
      allowed: false,
      blocked: true,
      reason: `IP blocked due to ${blockInfo.reason}`,
      retryAfter: Math.ceil(
        (blockInfo.expiresAt.getTime() - Date.now()) / 1000
      ),
    };
  }

  const key = REDIS_KEYS.API_AUTH_FAILED(ipAddress);
  const count = await getCounter(key);

  if (count >= ABUSE_THRESHOLDS.API_AUTH_FAILED_MAX) {
    return {
      allowed: false,
      reason: 'Too many failed API authentication attempts',
      retryAfter: Math.ceil(ABUSE_THRESHOLDS.API_AUTH_FAILED_WINDOW_MS / 1000),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    remainingAttempts: ABUSE_THRESHOLDS.API_AUTH_FAILED_MAX - count,
  };
}

/**
 * Record a failed API auth attempt. Auto-blocks IP if threshold exceeded.
 */
export async function recordApiAuthFailure(ipAddress: string): Promise<void> {
  const key = REDIS_KEYS.API_AUTH_FAILED(ipAddress);
  const { count } = await incrementCounter(
    key,
    ABUSE_THRESHOLDS.API_AUTH_FAILED_WINDOW_MS
  );

  if (count >= ABUSE_THRESHOLDS.API_AUTH_FAILED_MAX) {
    void blockIP(ipAddress, 'api_auth_failed');
  }
}

/**
 * Clear API auth failures (e.g. on successful auth from that IP)
 */
export async function clearApiAuthFailures(ipAddress: string): Promise<void> {
  await deleteKeys(REDIS_KEYS.API_AUTH_FAILED(ipAddress));
}
