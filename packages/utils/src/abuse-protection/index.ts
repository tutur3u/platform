/**
 * OTP Abuse Protection System
 *
 * Provides rate limiting and IP blocking for OTP-related operations
 * to prevent brute force attacks and enumeration.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database, Json } from '@tuturuuu/types';
import { getUpstashRestRedisClient, hasUpstashRestEnv } from '../upstash-rest';
import {
  ABUSE_THRESHOLDS,
  BLOCK_DURATIONS,
  MAX_BLOCK_LEVEL,
  REDIS_KEYS,
  WINDOW_MS,
} from './constants';
import type {
  AbuseCheckResult,
  AbuseEventType,
  BlockInfo,
  LogAbuseEventOptions,
  RedisClient,
} from './types';

// Re-export types and constants
export * from './constants';
export * from './types';

// In-memory fallback store
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

// Redis client singleton (lazy initialized)
let redisClient: RedisClient | null = null;
let redisInitialized = false;

/**
 * Initialize Redis client from Upstash environment variables
 */
async function getRedisClient(): Promise<RedisClient | null> {
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

function normalizeAbuseEventEmail(email?: string): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
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

async function getCounterWithTTL(
  key: string
): Promise<{ count: number; ttl: number }> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const [count, ttl] = await Promise.all([
        redis.get<number>(key),
        redis.ttl(key),
      ]);

      return {
        count: count || 0,
        ttl: ttl > 0 ? ttl : 0,
      };
    } catch {
      // Fall through to memory
    }
  }

  const existing = memoryStore.get(key);
  if (!existing) {
    return { count: 0, ttl: 0 };
  }

  const now = Date.now();
  if (now > existing.expiresAt) {
    memoryStore.delete(key);
    return { count: 0, ttl: 0 };
  }

  return {
    count: existing.count,
    ttl: Math.ceil((existing.expiresAt - now) / 1000),
  };
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

async function deleteKeysWithCount(...keys: string[]): Promise<number> {
  if (keys.length === 0) {
    return 0;
  }

  const redis = await getRedisClient();

  if (redis) {
    try {
      const deleted = await redis.del(...keys);
      return typeof deleted === 'number' ? deleted : 0;
    } catch {
      // Fall through to memory
    }
  }

  let deleted = 0;
  for (const key of keys) {
    if (memoryStore.delete(key)) {
      deleted++;
    }
  }

  return deleted;
}

/**
 * Create Supabase admin client for database operations
 */
async function getSupabaseAdmin(): Promise<SupabaseClient<Database> | null> {
  try {
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    return (await createAdminClient()) as SupabaseClient<Database>;
  } catch (error) {
    console.error(
      '[Abuse Protection] Failed to create Supabase client:',
      error
    );
    return null;
  }
}

/**
 * Check if an IP is currently blocked
 */
export async function isIPBlocked(
  ipAddress: string
): Promise<BlockInfo | null> {
  const redis = await getRedisClient();

  // Check Redis cache first
  if (redis) {
    try {
      const cached = await redis.get<string>(REDIS_KEYS.IP_BLOCKED(ipAddress));
      if (cached) {
        const blockInfo =
          typeof cached === 'string' ? JSON.parse(cached) : cached;
        if (new Date(blockInfo.expiresAt) > new Date()) {
          return {
            id: blockInfo.id,
            blockLevel: blockInfo.level,
            reason: blockInfo.reason,
            expiresAt: new Date(blockInfo.expiresAt),
            blockedAt: new Date(blockInfo.blockedAt),
          };
        }
      }
    } catch (error) {
      console.error('[Abuse Protection] Redis cache error:', error);
    }
  }

  // Check database
  try {
    const sbAdmin = await getSupabaseAdmin();
    if (!sbAdmin) return null;

    const { data, error } = await sbAdmin.rpc('get_active_ip_block', {
      p_ip_address: ipAddress,
    });

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    const block = Array.isArray(data) ? data[0] : data;
    if (!block) {
      return null;
    }
    const blockInfo: BlockInfo = {
      id: block.id,
      blockLevel: block.block_level,
      reason: block.reason,
      expiresAt: new Date(block.expires_at),
      blockedAt: new Date(block.blocked_at),
    };

    // Cache in Redis
    if (redis && blockInfo.expiresAt > new Date()) {
      const ttl = Math.ceil(
        (blockInfo.expiresAt.getTime() - Date.now()) / 1000
      );
      await redis.set(
        REDIS_KEYS.IP_BLOCKED(ipAddress),
        JSON.stringify({
          id: blockInfo.id,
          level: blockInfo.blockLevel,
          reason: blockInfo.reason,
          expiresAt: blockInfo.expiresAt.toISOString(),
          blockedAt: blockInfo.blockedAt.toISOString(),
        }),
        { ex: ttl }
      );
    }

    return blockInfo;
  } catch (error) {
    console.error('[Abuse Protection] DB error checking block:', error);
    return null;
  }
}

/**
 * Block an IP address with progressive duration
 */
export async function blockIP(
  ipAddress: string,
  reason: AbuseEventType,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const sbAdmin = await getSupabaseAdmin();
    if (!sbAdmin) return;

    const redis = await getRedisClient();

    // Get current block level
    let currentLevel = 0;
    if (redis) {
      try {
        const level = await redis.get<number>(
          REDIS_KEYS.IP_BLOCK_LEVEL(ipAddress)
        );
        currentLevel = level || 0;
      } catch {
        // Check DB fallback
        const { data } = await sbAdmin.rpc('get_ip_block_level', {
          p_ip_address: ipAddress,
        });
        currentLevel = (data as number) || 0;
      }
    } else {
      const { data } = await sbAdmin.rpc('get_ip_block_level', {
        p_ip_address: ipAddress,
      });
      currentLevel = (data as number) || 0;
    }

    // Calculate new block level (max 4)
    const newLevel = Math.min(currentLevel + 1, MAX_BLOCK_LEVEL) as
      | 1
      | 2
      | 3
      | 4;
    const blockDuration = BLOCK_DURATIONS[newLevel];
    const expiresAt = new Date(Date.now() + blockDuration * 1000);

    // Insert block record
    const { data: blockRecord, error } = await sbAdmin
      .from('blocked_ips')
      .insert([
        {
          ip_address: ipAddress,
          reason: reason as never,
          block_level: newLevel,
          expires_at: expiresAt.toISOString(),
          metadata: (metadata || {}) as Json,
        },
      ])
      .select('id')
      .single();

    if (error) {
      console.error('[Abuse Protection] Error creating block:', error);
      return;
    }

    // Update Redis cache
    if (redis) {
      await Promise.all([
        redis.set(
          REDIS_KEYS.IP_BLOCKED(ipAddress),
          JSON.stringify({
            id: blockRecord.id,
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
  unblockingUserId: string,
  reason?: string
): Promise<boolean> {
  try {
    const sbAdmin = await getSupabaseAdmin();
    if (!sbAdmin) return false;

    const redis = await getRedisClient();

    // Update all active blocks for this IP
    const { error } = await sbAdmin
      .from('blocked_ips')
      .update({
        status: 'manually_unblocked',
        unblocked_at: new Date().toISOString(),
        unblocked_by: unblockingUserId,
        unblock_reason: reason || 'Manual unblock by admin',
      })
      .eq('ip_address', ipAddress)
      .eq('status', 'active');

    if (error) {
      console.error('[Abuse Protection] Error unblocking IP:', error);
      return false;
    }

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
 * Log an abuse event for audit trail
 */
export async function logAbuseEvent(
  ipAddress: string,
  eventType: AbuseEventType,
  options?: LogAbuseEventOptions
): Promise<void> {
  try {
    const sbAdmin = await getSupabaseAdmin();
    if (!sbAdmin) return;
    const normalizedEmail = normalizeAbuseEventEmail(options?.email);

    await sbAdmin.from('abuse_events').insert([
      {
        ip_address: ipAddress,
        event_type: eventType as never,
        email: normalizedEmail,
        email_hash: normalizedEmail ? hashEmail(normalizedEmail) : null,
        user_agent: options?.userAgent?.substring(0, 500),
        endpoint: options?.endpoint,
        success: options?.success ?? false,
        metadata: (options?.metadata || {}) as Json,
      },
    ]);
  } catch (error) {
    console.error('[Abuse Protection] Error logging event:', error);
  }
}

export interface ResetOtpLimitsForEmailOptions {
  email: string;
  clearEmailScoped: boolean;
  clearRelatedIpCounters: boolean;
  clearRelatedIpBlocks: boolean;
  adminUserId: string;
  reason?: string;
  adminIpAddress?: string;
}

export interface ResetOtpLimitsForEmailResult {
  relatedIps: string[];
  clearedEmailKeys: number;
  clearedIpCounterCount: number;
  unblockedIpCount: number;
}

function normalizeOtpResetEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const regex = /\S+@\S+\.\S+/;

  if (!normalized || !regex.test(normalized)) {
    throw new Error('Email is invalid');
  }

  return normalized;
}

function getOtpResetScopeKeys(ipAddress: string): string[] {
  return [
    REDIS_KEYS.OTP_SEND(ipAddress),
    REDIS_KEYS.OTP_SEND_HOURLY(ipAddress),
    REDIS_KEYS.OTP_SEND_DAILY(ipAddress),
    REDIS_KEYS.OTP_VERIFY_FAILED(ipAddress),
    REDIS_KEYS.IP_BLOCK_LEVEL(ipAddress),
  ];
}

export async function resetOtpLimitsForEmail({
  email,
  clearEmailScoped,
  clearRelatedIpCounters,
  clearRelatedIpBlocks,
  adminUserId,
  reason,
  adminIpAddress,
}: ResetOtpLimitsForEmailOptions): Promise<ResetOtpLimitsForEmailResult> {
  if (!clearEmailScoped && !clearRelatedIpCounters && !clearRelatedIpBlocks) {
    throw new Error('At least one OTP reset option is required');
  }

  const normalizedEmail = normalizeOtpResetEmail(email);
  const emailHash = hashEmail(normalizedEmail);
  const sbAdmin = await getSupabaseAdmin();

  if (!sbAdmin) {
    throw new Error('Failed to create Supabase client');
  }

  let relatedIps: string[] = [];
  if (clearRelatedIpCounters || clearRelatedIpBlocks) {
    const sinceIso = new Date(
      Date.now() - WINDOW_MS.TWENTY_FOUR_HOURS
    ).toISOString();
    const { data: relatedEvents, error: relatedEventsError } = await sbAdmin
      .from('abuse_events')
      .select('ip_address')
      .eq('email', normalizedEmail)
      .in('event_type', ['otp_send', 'otp_verify_failed'])
      .gte('created_at', sinceIso);

    if (relatedEventsError) {
      throw relatedEventsError;
    }

    relatedIps = Array.from(
      new Set(
        (relatedEvents ?? [])
          .map((event: { ip_address: string | null }) => event.ip_address)
          .filter((value: string | null): value is string => !!value)
      )
    );
  }

  let clearedEmailKeys = 0;
  if (clearEmailScoped) {
    clearedEmailKeys = await deleteKeysWithCount(
      REDIS_KEYS.OTP_SEND_EMAIL_COOLDOWN(emailHash),
      REDIS_KEYS.OTP_SEND_EMAIL_HOURLY(emailHash),
      REDIS_KEYS.OTP_SEND_EMAIL_DAILY(emailHash),
      REDIS_KEYS.OTP_VERIFY_FAILED_EMAIL(emailHash)
    );
  }

  let clearedIpCounterCount = 0;
  if (clearRelatedIpCounters && relatedIps.length > 0) {
    const relatedIpKeys = relatedIps.flatMap((ipAddress) =>
      getOtpResetScopeKeys(ipAddress)
    );
    clearedIpCounterCount = await deleteKeysWithCount(...relatedIpKeys);
  }

  let unblockedIpCount = 0;
  let unblockedIps: string[] = [];
  if (clearRelatedIpBlocks && relatedIps.length > 0) {
    const { data: activeBlocks, error: activeBlocksError } = await sbAdmin
      .from('blocked_ips')
      .select('ip_address')
      .in('ip_address', relatedIps)
      .in('reason', ['otp_send', 'otp_verify_failed'])
      .eq('status', 'active');

    if (activeBlocksError) {
      throw activeBlocksError;
    }

    unblockedIps = Array.from(
      new Set(
        (activeBlocks ?? [])
          .map((block: { ip_address: string | null }) => block.ip_address)
          .filter((value: string | null): value is string => !!value)
      )
    );

    if (unblockedIps.length > 0) {
      const { error: unblockError } = await sbAdmin
        .from('blocked_ips')
        .update({
          status: 'manually_unblocked',
          unblocked_at: new Date().toISOString(),
          unblocked_by: adminUserId,
          unblock_reason:
            reason || 'Manual OTP limit reset unblock by infrastructure admin',
        })
        .in('ip_address', unblockedIps)
        .in('reason', ['otp_send', 'otp_verify_failed'])
        .eq('status', 'active');

      if (unblockError) {
        throw unblockError;
      }

      await deleteKeysWithCount(
        ...unblockedIps.flatMap((ipAddress) => [
          REDIS_KEYS.IP_BLOCKED(ipAddress),
          REDIS_KEYS.IP_BLOCK_LEVEL(ipAddress),
        ])
      );
      unblockedIpCount = unblockedIps.length;
    }
  }

  await logAbuseEvent(adminIpAddress || 'unknown', 'otp_limit_reset', {
    email: normalizedEmail,
    success: true,
    metadata: {
      admin_user_id: adminUserId,
      reason: reason || null,
      clearEmailScoped,
      clearRelatedIpCounters,
      clearRelatedIpBlocks,
      related_ips: relatedIps,
      related_ips_count: relatedIps.length,
      cleared_email_keys: clearedEmailKeys,
      cleared_ip_counter_count: clearedIpCounterCount,
      unblocked_ips: unblockedIps,
      unblocked_ip_count: unblockedIpCount,
    },
  });

  return {
    relatedIps,
    clearedEmailKeys,
    clearedIpCounterCount,
    unblockedIpCount,
  };
}

/**
 * Check and track OTP send attempts
 */
export async function checkOTPSendAllowed(
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

  const minuteKey = REDIS_KEYS.OTP_SEND(ipAddress);
  const hourlyKey = REDIS_KEYS.OTP_SEND_HOURLY(ipAddress);
  const dailyKey = REDIS_KEYS.OTP_SEND_DAILY(ipAddress);

  const [minuteState, hourlyState, dailyState] = await Promise.all([
    getCounterWithTTL(minuteKey),
    getCounterWithTTL(hourlyKey),
    getCounterWithTTL(dailyKey),
  ]);

  if (minuteState.count >= ABUSE_THRESHOLDS.OTP_SEND_PER_MINUTE) {
    // Log and potentially block
    void logAbuseEvent(ipAddress, 'otp_send', {
      email,
      success: false,
      metadata: { trigger: 'minute_limit' },
    });

    if (minuteState.count >= ABUSE_THRESHOLDS.OTP_SEND_PER_MINUTE * 2) {
      // Aggressive abuse - block IP
      void blockIP(ipAddress, 'otp_send', { trigger: 'rate_limit_exceeded' });
    }

    return {
      allowed: false,
      reason: 'Too many OTP requests. Please try again later.',
      retryAfter: minuteState.ttl,
      remainingAttempts: 0,
    };
  }

  if (hourlyState.count >= ABUSE_THRESHOLDS.OTP_SEND_PER_HOUR) {
    void logAbuseEvent(ipAddress, 'otp_send', {
      email,
      success: false,
      metadata: { trigger: 'hourly_rate_limit' },
    });

    void blockIP(ipAddress, 'otp_send', { trigger: 'hourly_rate_limit' });

    return {
      allowed: false,
      reason: 'Hourly OTP limit reached. Please try again later.',
      retryAfter: hourlyState.ttl,
      remainingAttempts: 0,
    };
  }

  if (dailyState.count >= ABUSE_THRESHOLDS.OTP_SEND_PER_DAY) {
    void logAbuseEvent(ipAddress, 'otp_send', {
      email,
      success: false,
      metadata: { trigger: 'ip_daily_limit' },
    });
    void blockIP(ipAddress, 'otp_send', { trigger: 'ip_daily_limit' });

    return {
      allowed: false,
      reason: 'OTP limit reached. Please try again later.',
      retryAfter: dailyState.ttl,
      remainingAttempts: 0,
    };
  }

  if (email) {
    const emailHash = hashEmail(email);

    const cooldownKey = REDIS_KEYS.OTP_SEND_EMAIL_COOLDOWN(emailHash);
    const hourlyEmailKey = REDIS_KEYS.OTP_SEND_EMAIL_HOURLY(emailHash);
    const dailyEmailKey = REDIS_KEYS.OTP_SEND_EMAIL_DAILY(emailHash);

    const [cooldownState, hourlyEmailState, dailyEmailState] =
      await Promise.all([
        getCounterWithTTL(cooldownKey),
        getCounterWithTTL(hourlyEmailKey),
        getCounterWithTTL(dailyEmailKey),
      ]);

    if (cooldownState.count >= 1) {
      void logAbuseEvent(ipAddress, 'otp_send', {
        email,
        success: false,
        metadata: { trigger: 'email_cooldown' },
      });

      return {
        allowed: false,
        reason: 'Too many OTP requests. Please try again later.',
        retryAfter: cooldownState.ttl,
        remainingAttempts: 0,
      };
    }

    if (hourlyEmailState.count >= ABUSE_THRESHOLDS.OTP_SEND_EMAIL_PER_HOUR) {
      void logAbuseEvent(ipAddress, 'otp_send', {
        email,
        success: false,
        metadata: { trigger: 'email_hourly_limit' },
      });

      return {
        allowed: false,
        reason: 'Hourly OTP limit reached. Please try again later.',
        retryAfter: hourlyEmailState.ttl,
        remainingAttempts: 0,
      };
    }

    if (dailyEmailState.count >= ABUSE_THRESHOLDS.OTP_SEND_EMAIL_PER_DAY) {
      void logAbuseEvent(ipAddress, 'otp_send', {
        email,
        success: false,
        metadata: { trigger: 'email_daily_limit' },
      });

      return {
        allowed: false,
        reason: 'OTP limit reached. Please try again later.',
        retryAfter: dailyEmailState.ttl,
        remainingAttempts: 0,
      };
    }
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(
      0,
      ABUSE_THRESHOLDS.OTP_SEND_PER_MINUTE - (minuteState.count + 1)
    ),
  };
}

export async function recordOTPSendSuccess(
  ipAddress: string,
  email?: string
): Promise<void> {
  await Promise.all([
    incrementCounter(REDIS_KEYS.OTP_SEND(ipAddress), WINDOW_MS.ONE_MINUTE),
    incrementCounter(REDIS_KEYS.OTP_SEND_HOURLY(ipAddress), WINDOW_MS.ONE_HOUR),
    incrementCounter(
      REDIS_KEYS.OTP_SEND_DAILY(ipAddress),
      WINDOW_MS.TWENTY_FOUR_HOURS
    ),
    ...(email
      ? [
          incrementCounter(
            REDIS_KEYS.OTP_SEND_EMAIL_COOLDOWN(hashEmail(email)),
            ABUSE_THRESHOLDS.OTP_SEND_EMAIL_COOLDOWN_WINDOW_MS
          ),
          incrementCounter(
            REDIS_KEYS.OTP_SEND_EMAIL_HOURLY(hashEmail(email)),
            WINDOW_MS.ONE_HOUR
          ),
          incrementCounter(
            REDIS_KEYS.OTP_SEND_EMAIL_DAILY(hashEmail(email)),
            WINDOW_MS.TWENTY_FOUR_HOURS
          ),
        ]
      : []),
  ]);

  void logAbuseEvent(ipAddress, 'otp_send', { email, success: true });
}

// Backward-compatible alias for call sites that still import the old helper.
export async function checkOTPSendLimit(
  ipAddress: string,
  email?: string
): Promise<AbuseCheckResult> {
  return checkOTPSendAllowed(ipAddress, email);
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

  // Log the failure
  void logAbuseEvent(ipAddress, 'otp_verify_failed', { email, success: false });

  // Block if threshold exceeded
  if (ipCount >= ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_MAX) {
    void blockIP(ipAddress, 'otp_verify_failed', {
      trigger: 'max_failures_exceeded',
      failedCount: ipCount,
    });
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
    void logAbuseEvent(ipAddress, 'mfa_challenge', { success: false });
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

  void logAbuseEvent(ipAddress, 'mfa_verify_failed', { success: false });

  if (count >= ABUSE_THRESHOLDS.MFA_VERIFY_FAILED_MAX) {
    void blockIP(ipAddress, 'mfa_verify_failed', {
      trigger: 'max_failures_exceeded',
      failedCount: count,
    });
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
    void logAbuseEvent(ipAddress, 'reauth_send', { success: false });
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

  void logAbuseEvent(ipAddress, 'reauth_verify_failed', { success: false });

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
  ipAddress: string,
  email?: string
): Promise<void> {
  const key = REDIS_KEYS.PASSWORD_LOGIN_FAILED(ipAddress);
  const { count } = await incrementCounter(
    key,
    ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_WINDOW_MS
  );

  void logAbuseEvent(ipAddress, 'password_login_failed', {
    email,
    success: false,
  });

  if (count >= ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_MAX) {
    void blockIP(ipAddress, 'password_login_failed', {
      trigger: 'max_failures_exceeded',
      failedCount: count,
    });
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
export async function recordApiAuthFailure(
  ipAddress: string,
  endpoint?: string
): Promise<void> {
  const key = REDIS_KEYS.API_AUTH_FAILED(ipAddress);
  const { count } = await incrementCounter(
    key,
    ABUSE_THRESHOLDS.API_AUTH_FAILED_WINDOW_MS
  );

  void logAbuseEvent(ipAddress, 'api_auth_failed', {
    endpoint,
    success: false,
  });

  if (count >= ABUSE_THRESHOLDS.API_AUTH_FAILED_MAX) {
    void blockIP(ipAddress, 'api_auth_failed', {
      trigger: 'max_failures_exceeded',
      failedCount: count,
      endpoint,
    });
  }
}

/**
 * Clear API auth failures (e.g. on successful auth from that IP)
 */
export async function clearApiAuthFailures(ipAddress: string): Promise<void> {
  await deleteKeys(REDIS_KEYS.API_AUTH_FAILED(ipAddress));
}
