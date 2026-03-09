/**
 * User suspension utilities.
 * Checks and manages user account suspensions.
 */

import { getUpstashRestRedisClient } from '../upstash-rest';
import type { RedisClient } from './types';

// Extend REDIS_KEYS locally (avoids modifying shared constants for this feature)
const SUSPENSION_KEYS = {
  USER_SUSPENDED: (userId: string) => `user:suspended:${userId}`,
} as const;

interface SuspensionResult {
  suspended: boolean;
  reason?: string;
  expiresAt?: Date;
}

// Lazy-loaded Redis client
let redisClient: RedisClient | null = null;
let redisInitialized = false;

async function getRedisClient(): Promise<RedisClient | null> {
  if (redisInitialized) return redisClient;

  try {
    redisClient = await getUpstashRestRedisClient();
    redisInitialized = true;
    return redisClient;
  } catch {
    redisInitialized = true;
    return null;
  }
}

async function getSupabaseAdmin() {
  try {
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    return await createAdminClient();
  } catch {
    return null;
  }
}

/**
 * Check if a user is currently suspended.
 * Checks Redis cache first (60s TTL), then falls back to DB.
 */
export async function checkUserSuspension(
  userId: string
): Promise<SuspensionResult> {
  const redis = await getRedisClient();

  // Check Redis cache first
  if (redis) {
    try {
      const cached = await redis.get<string>(
        SUSPENSION_KEYS.USER_SUSPENDED(userId)
      );
      if (cached === 'not_suspended') {
        return { suspended: false };
      }
      if (cached && cached !== 'not_suspended') {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        if (!data.expiresAt || new Date(data.expiresAt) > new Date()) {
          return {
            suspended: true,
            reason: data.reason,
            expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
          };
        }
      }
    } catch {
      // Fall through to DB check
    }
  }

  // Check database
  try {
    const sbAdmin = await getSupabaseAdmin();
    if (!sbAdmin) return { suspended: false };

    const { data, error } = await sbAdmin
      .from('user_suspensions')
      .select('id, reason, expires_at')
      .eq('user_id', userId)
      .is('lifted_at', null)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('suspended_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      // Cache negative result
      if (redis) {
        await redis.set(
          SUSPENSION_KEYS.USER_SUSPENDED(userId),
          'not_suspended',
          { ex: 60 }
        );
      }
      return { suspended: false };
    }

    const result: SuspensionResult = {
      suspended: true,
      reason: data.reason,
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
    };

    // Cache positive result
    if (redis) {
      const ttl = data.expires_at
        ? Math.min(
            60,
            Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 1000)
          )
        : 60;
      await redis.set(
        SUSPENSION_KEYS.USER_SUSPENDED(userId),
        JSON.stringify({
          reason: data.reason,
          expiresAt: data.expires_at,
        }),
        { ex: Math.max(1, ttl) }
      );
    }

    return result;
  } catch {
    // Fail-open: if check fails, don't block user
    return { suspended: false };
  }
}

/**
 * Suspend a user account.
 */
export async function suspendUser(
  userId: string,
  reason: string,
  suspendedBy: string,
  expiresAt?: Date
): Promise<boolean> {
  try {
    const sbAdmin = await getSupabaseAdmin();
    if (!sbAdmin) return false;

    const { error } = await sbAdmin.from('user_suspensions').insert({
      user_id: userId,
      reason,
      suspended_by: suspendedBy,
      expires_at: expiresAt?.toISOString() ?? null,
    });

    if (error) {
      console.error('[User Suspension] Error suspending user:', error);
      return false;
    }

    // Update Redis cache
    const redis = await getRedisClient();
    if (redis) {
      const ttl = expiresAt
        ? Math.ceil((expiresAt.getTime() - Date.now()) / 1000)
        : 60;
      await redis.set(
        SUSPENSION_KEYS.USER_SUSPENDED(userId),
        JSON.stringify({
          reason,
          expiresAt: expiresAt?.toISOString() ?? null,
        }),
        { ex: Math.max(1, ttl) }
      );
    }

    return true;
  } catch (error) {
    console.error('[User Suspension] Error:', error);
    return false;
  }
}

/**
 * Lift a user suspension.
 */
export async function liftSuspension(
  suspensionId: string,
  liftedBy: string
): Promise<boolean> {
  try {
    const sbAdmin = await getSupabaseAdmin();
    if (!sbAdmin) return false;

    // Get the suspension to find the user_id
    const { data: suspension } = await sbAdmin
      .from('user_suspensions')
      .select('user_id')
      .eq('id', suspensionId)
      .single();

    if (!suspension) return false;

    const { error } = await sbAdmin
      .from('user_suspensions')
      .update({
        lifted_at: new Date().toISOString(),
        lifted_by: liftedBy,
      })
      .eq('id', suspensionId);

    if (error) {
      console.error('[User Suspension] Error lifting suspension:', error);
      return false;
    }

    // Clear Redis cache so next check hits DB
    const redis = await getRedisClient();
    if (redis) {
      await redis.del(SUSPENSION_KEYS.USER_SUSPENDED(suspension.user_id));
    }

    return true;
  } catch (error) {
    console.error('[User Suspension] Error:', error);
    return false;
  }
}
