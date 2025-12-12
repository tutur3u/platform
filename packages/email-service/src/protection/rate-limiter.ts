/**
 * Email Rate Limiter
 *
 * Provides multi-dimensional rate limiting for email sending.
 * Uses Redis with in-memory fallback (consistent with abuse-protection patterns).
 */

import { createHash } from 'crypto';

import {
  EMAIL_RATE_LIMITS,
  EMAIL_REDIS_KEYS,
  EMAIL_WINDOW_MS,
} from '../constants';
import type {
  EmailMetadata,
  RateLimitConfig,
  RateLimitInfo,
  RateLimitType,
} from '../types';

// =============================================================================
// Redis Client Types
// =============================================================================

interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  get<T>(key: string): Promise<T | null>;
  del(...keys: string[]): Promise<number>;
}

// =============================================================================
// In-Memory Fallback Store
// =============================================================================

const memoryStore = new Map<string, { count: number; expiresAt: number }>();

// Clean up expired entries periodically
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (now > value.expiresAt) {
        memoryStore.delete(key);
      }
    }
  },
  60 * 1000 // Every minute
);

// =============================================================================
// Redis Client Singleton
// =============================================================================

let redisClient: RedisClient | null = null;
let redisInitialized = false;

async function getRedisClient(): Promise<RedisClient | null> {
  if (redisInitialized) return redisClient;

  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      console.warn(
        '[EmailRateLimiter] Redis not configured - falling back to memory'
      );
      redisInitialized = true;
      return null;
    }

    const { Redis } = await import('@upstash/redis');
    redisClient = Redis.fromEnv() as unknown as RedisClient;
    redisInitialized = true;
    return redisClient;
  } catch (error) {
    console.warn('[EmailRateLimiter] Redis unavailable:', error);
    redisInitialized = true;
    return null;
  }
}

// =============================================================================
// Email Rate Limiter Class
// =============================================================================

export class EmailRateLimiter {
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...EMAIL_RATE_LIMITS, ...config };
  }

  /**
   * Hash email for privacy when storing in rate limit keys.
   */
  hashEmail(email: string): string {
    return createHash('sha256')
      .update(email.toLowerCase())
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Check all applicable rate limits for an email send operation.
   * Does NOT increment counters - call incrementCounters() after successful send.
   */
  async checkRateLimits(
    metadata: EmailMetadata
    // recipientCount: number
  ): Promise<RateLimitInfo> {
    const checks: Promise<{
      result: RateLimitInfo;
      limitType: RateLimitType;
    }>[] = [];

    // Workspace rate limits
    if (metadata.wsId) {
      // Check if this is an invite (stricter limits)
      if (metadata.isInvite) {
        checks.push(
          this.checkSingleLimit(
            EMAIL_REDIS_KEYS.WS_INVITE_MINUTE(metadata.wsId),
            this.config.invitePerMinute,
            EMAIL_WINDOW_MS.ONE_MINUTE,
            'Workspace invite minute limit exceeded',
            'invite_minute'
          )
        );
        checks.push(
          this.checkSingleLimit(
            EMAIL_REDIS_KEYS.WS_INVITE_HOUR(metadata.wsId),
            this.config.invitePerHour,
            EMAIL_WINDOW_MS.ONE_HOUR,
            'Workspace invite hourly limit exceeded',
            'invite_hour'
          )
        );
        checks.push(
          this.checkSingleLimit(
            EMAIL_REDIS_KEYS.WS_INVITE_DAY(metadata.wsId),
            this.config.invitePerDay,
            EMAIL_WINDOW_MS.ONE_DAY,
            'Workspace invite daily limit exceeded',
            'invite_day'
          )
        );
      } else {
        checks.push(
          this.checkSingleLimit(
            EMAIL_REDIS_KEYS.WS_EMAIL_MINUTE(metadata.wsId),
            this.config.workspacePerMinute,
            EMAIL_WINDOW_MS.ONE_MINUTE,
            'Workspace minute limit exceeded',
            'workspace_minute'
          )
        );
        checks.push(
          this.checkSingleLimit(
            EMAIL_REDIS_KEYS.WS_EMAIL_HOUR(metadata.wsId),
            this.config.workspacePerHour,
            EMAIL_WINDOW_MS.ONE_HOUR,
            'Workspace hourly limit exceeded',
            'workspace_hour'
          )
        );
        checks.push(
          this.checkSingleLimit(
            EMAIL_REDIS_KEYS.WS_EMAIL_DAY(metadata.wsId),
            this.config.workspacePerDay,
            EMAIL_WINDOW_MS.ONE_DAY,
            'Workspace daily limit exceeded',
            'workspace_day'
          )
        );
      }
    }

    // User rate limits
    if (metadata.userId) {
      checks.push(
        this.checkSingleLimit(
          EMAIL_REDIS_KEYS.USER_EMAIL_MINUTE(metadata.userId),
          this.config.userPerMinute,
          EMAIL_WINDOW_MS.ONE_MINUTE,
          'User minute limit exceeded',
          'user_minute'
        )
      );
      checks.push(
        this.checkSingleLimit(
          EMAIL_REDIS_KEYS.USER_EMAIL_HOUR(metadata.userId),
          this.config.userPerHour,
          EMAIL_WINDOW_MS.ONE_HOUR,
          'User hourly limit exceeded',
          'user_hour'
        )
      );
    }

    // IP rate limits
    if (metadata.ipAddress && metadata.ipAddress !== 'unknown') {
      checks.push(
        this.checkSingleLimit(
          EMAIL_REDIS_KEYS.IP_MINUTE(metadata.ipAddress),
          this.config.ipPerMinute,
          EMAIL_WINDOW_MS.ONE_MINUTE,
          'IP minute limit exceeded',
          'ip_minute'
        )
      );
      checks.push(
        this.checkSingleLimit(
          EMAIL_REDIS_KEYS.IP_HOUR(metadata.ipAddress),
          this.config.ipPerHour,
          EMAIL_WINDOW_MS.ONE_HOUR,
          'IP hourly limit exceeded',
          'ip_hour'
        )
      );
    }

    // Wait for all checks
    const results = await Promise.all(checks);

    // Return first failure
    for (const { result, limitType } of results) {
      if (!result.allowed) {
        return { ...result, limitType };
      }
    }

    // All passed - return aggregate
    const minRemaining = Math.min(...results.map((r) => r.result.remaining));
    return { allowed: true, remaining: minRemaining };
  }

  /**
   * Check rate limits for individual recipients.
   * Returns a map of blocked recipients with their rate limit info.
   */
  async checkRecipientLimits(
    recipients: string[]
  ): Promise<Map<string, RateLimitInfo>> {
    const blocked = new Map<string, RateLimitInfo>();

    for (const email of recipients) {
      const emailHash = this.hashEmail(email);

      // Check hourly recipient limit
      const { result: hourlyResult } = await this.checkSingleLimit(
        EMAIL_REDIS_KEYS.RECIPIENT_HOUR(emailHash),
        this.config.recipientPerHour,
        EMAIL_WINDOW_MS.ONE_HOUR,
        'Recipient hourly limit exceeded',
        'recipient_hour'
      );

      if (!hourlyResult.allowed) {
        blocked.set(email, { ...hourlyResult, limitType: 'recipient_hour' });
        continue;
      }

      // Check daily recipient limit
      const { result: dailyResult } = await this.checkSingleLimit(
        EMAIL_REDIS_KEYS.RECIPIENT_DAY(emailHash),
        this.config.recipientPerDay,
        EMAIL_WINDOW_MS.ONE_DAY,
        'Recipient daily limit exceeded',
        'recipient_day'
      );

      if (!dailyResult.allowed) {
        blocked.set(email, { ...dailyResult, limitType: 'recipient_day' });
      }
    }

    return blocked;
  }

  /**
   * Increment rate limit counters after successful email send.
   * Call this ONLY after the email is successfully sent.
   */
  async incrementCounters(
    metadata: EmailMetadata,
    recipients: string[]
  ): Promise<void> {
    const increments: Promise<void>[] = [];

    // Workspace counters
    if (metadata.wsId) {
      if (metadata.isInvite) {
        increments.push(
          this.incrementKey(
            EMAIL_REDIS_KEYS.WS_INVITE_MINUTE(metadata.wsId),
            EMAIL_WINDOW_MS.ONE_MINUTE
          )
        );
        increments.push(
          this.incrementKey(
            EMAIL_REDIS_KEYS.WS_INVITE_HOUR(metadata.wsId),
            EMAIL_WINDOW_MS.ONE_HOUR
          )
        );
        increments.push(
          this.incrementKey(
            EMAIL_REDIS_KEYS.WS_INVITE_DAY(metadata.wsId),
            EMAIL_WINDOW_MS.ONE_DAY
          )
        );
      } else {
        increments.push(
          this.incrementKey(
            EMAIL_REDIS_KEYS.WS_EMAIL_MINUTE(metadata.wsId),
            EMAIL_WINDOW_MS.ONE_MINUTE
          )
        );
        increments.push(
          this.incrementKey(
            EMAIL_REDIS_KEYS.WS_EMAIL_HOUR(metadata.wsId),
            EMAIL_WINDOW_MS.ONE_HOUR
          )
        );
        increments.push(
          this.incrementKey(
            EMAIL_REDIS_KEYS.WS_EMAIL_DAY(metadata.wsId),
            EMAIL_WINDOW_MS.ONE_DAY
          )
        );
      }
    }

    // User counters
    if (metadata.userId) {
      increments.push(
        this.incrementKey(
          EMAIL_REDIS_KEYS.USER_EMAIL_MINUTE(metadata.userId),
          EMAIL_WINDOW_MS.ONE_MINUTE
        )
      );
      increments.push(
        this.incrementKey(
          EMAIL_REDIS_KEYS.USER_EMAIL_HOUR(metadata.userId),
          EMAIL_WINDOW_MS.ONE_HOUR
        )
      );
    }

    // IP counters
    if (metadata.ipAddress && metadata.ipAddress !== 'unknown') {
      increments.push(
        this.incrementKey(
          EMAIL_REDIS_KEYS.IP_MINUTE(metadata.ipAddress),
          EMAIL_WINDOW_MS.ONE_MINUTE
        )
      );
      increments.push(
        this.incrementKey(
          EMAIL_REDIS_KEYS.IP_HOUR(metadata.ipAddress),
          EMAIL_WINDOW_MS.ONE_HOUR
        )
      );
    }

    // Recipient counters
    for (const email of recipients) {
      const emailHash = this.hashEmail(email);
      increments.push(
        this.incrementKey(
          EMAIL_REDIS_KEYS.RECIPIENT_HOUR(emailHash),
          EMAIL_WINDOW_MS.ONE_HOUR
        )
      );
      increments.push(
        this.incrementKey(
          EMAIL_REDIS_KEYS.RECIPIENT_DAY(emailHash),
          EMAIL_WINDOW_MS.ONE_DAY
        )
      );
    }

    await Promise.all(increments);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check a single rate limit without incrementing.
   */
  private async checkSingleLimit(
    key: string,
    max: number,
    windowMs: number,
    reason: string,
    limitType: RateLimitType
  ): Promise<{ result: RateLimitInfo; limitType: RateLimitType }> {
    const count = await this.getCount(key);

    if (count >= max) {
      const ttl = await this.getTTL(key, windowMs);
      return {
        result: {
          allowed: false,
          remaining: 0,
          limit: max,
          usage: count,
          retryAfter: ttl,
          reason,
        },
        limitType,
      };
    }

    return {
      result: {
        allowed: true,
        remaining: max - count,
        limit: max,
        usage: count,
      },
      limitType,
    };
  }

  /**
   * Get current count for a key.
   */
  private async getCount(key: string): Promise<number> {
    const redis = await getRedisClient();

    if (redis) {
      try {
        const count = await redis.get<number>(key);
        return count || 0;
      } catch (error) {
        console.error('[EmailRateLimiter] Redis get error:', error);
        // Fall through to memory
      }
    }

    // Memory fallback
    const existing = memoryStore.get(key);
    if (!existing || Date.now() > existing.expiresAt) {
      return 0;
    }
    return existing.count;
  }

  /**
   * Get TTL for a key (seconds until expiry).
   */
  private async getTTL(key: string, defaultWindowMs: number): Promise<number> {
    const redis = await getRedisClient();

    if (redis) {
      try {
        const ttl = await redis.ttl(key);
        return ttl > 0 ? ttl : Math.ceil(defaultWindowMs / 1000);
      } catch {
        // Fall through to default
      }
    }

    // Memory fallback
    const existing = memoryStore.get(key);
    if (existing && Date.now() < existing.expiresAt) {
      return Math.ceil((existing.expiresAt - Date.now()) / 1000);
    }

    return Math.ceil(defaultWindowMs / 1000);
  }

  /**
   * Increment a key with automatic expiration.
   */
  private async incrementKey(key: string, windowMs: number): Promise<void> {
    const redis = await getRedisClient();

    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, Math.ceil(windowMs / 1000));
        }
        return;
      } catch (error) {
        console.error('[EmailRateLimiter] Redis incr error:', error);
        // Fall through to memory
      }
    }

    // Memory fallback
    const now = Date.now();
    const existing = memoryStore.get(key);

    if (!existing || now > existing.expiresAt) {
      memoryStore.set(key, { count: 1, expiresAt: now + windowMs });
    } else {
      existing.count++;
    }
  }
}
