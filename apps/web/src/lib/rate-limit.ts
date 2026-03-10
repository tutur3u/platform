/**
 * Shared rate-limiting infrastructure.
 *
 * Extracted from api-middleware.ts so that both withApiAuth (API-key routes)
 * and withSessionAuth (session-auth routes) can reuse the same Redis/memory
 * sliding-window implementation.
 */

import type { ApiErrorResponse } from '@tuturuuu/types/sdk';
import {
  getUpstashRestRedisClient,
  hasUpstashRestEnv,
  type UpstashRestRedisClient,
} from '@tuturuuu/utils/upstash-rest';
import { NextResponse } from 'next/server';

/**
 * Creates a standardized error response.
 * Defined here to avoid circular imports with api-middleware.ts.
 */
function createRateLimitErrorResponse(
  error: string,
  message: string,
  status: number,
  code?: string,
  headers?: Record<string, string>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error,
      message,
      ...(code && { code }),
    },
    { status, headers }
  );
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

/**
 * Rate limit result with headers
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
}

/**
 * Mira-specific read rate limit.
 *
 * This is intentionally set to 2x the standard GET limit used by
 * `withSessionAuth` (60 req/min) to allow higher throughput for
 * Mira read endpoints while still providing protection.
 */
export const MIRA_READ_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 120,
};

/**
 * Builds a stable rate limit key for Mira read endpoints.
 * Uses a per-endpoint, per-IP key to avoid cross-endpoint interference.
 */
export function buildMiraReadRateLimitKey(
  endpoint: string,
  ipAddress: string
): string {
  const safeEndpoint = endpoint || 'unknown';
  const safeIp = ipAddress || 'unknown';
  return `mira:read:${safeEndpoint}:${safeIp}`;
}

/**
 * Workspace-specific rate limit secret names
 */
export const RATE_LIMIT_SECRET_NAMES = {
  WINDOW_MS: 'RATE_LIMIT_WINDOW_MS',
  MAX_REQUESTS: 'RATE_LIMIT_MAX_REQUESTS',
  UPLOAD_MAX_REQUESTS: 'RATE_LIMIT_UPLOAD_MAX_REQUESTS',
  DOWNLOAD_MAX_REQUESTS: 'RATE_LIMIT_DOWNLOAD_MAX_REQUESTS',
  UPLOAD_URL_MAX_REQUESTS: 'RATE_LIMIT_UPLOAD_URL_MAX_REQUESTS',
} as const;

/**
 * In-memory rate limit store (fallback when Redis unavailable)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Redis client type (lazy-loaded)
 */
let redisClient: UpstashRestRedisClient | null = null;
let redisInitialized = false;

/**
 * Initialize Redis client for rate limiting.
 * Safe to call multiple times — only initializes once.
 */
export async function getRedisClient() {
  if (redisInitialized) return redisClient;

  try {
    if (!hasUpstashRestEnv()) {
      console.warn(
        'Redis rate limiting disabled: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured'
      );
      redisInitialized = true;
      return null;
    }

    redisClient = await getUpstashRestRedisClient();
    redisInitialized = true;
    console.log('Redis rate limiting enabled');
    return redisClient;
  } catch (error) {
    console.warn(
      'Redis rate limiting unavailable - falling back to in-memory:',
      error
    );
    redisInitialized = true;
    return null;
  }
}

/**
 * Rate limit using Redis (production-ready, serverless-safe)
 */
export async function checkRateLimitRedis(
  keyId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = await getRedisClient();
  if (!redis) {
    return checkRateLimitMemory(keyId, config);
  }

  const key = `ratelimit:${keyId}`;
  const windowSeconds = Math.ceil(config.windowMs / 1000);
  const now = Math.floor(Date.now() / 1000);

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const resetTime = now + (ttl > 0 ? ttl : windowSeconds);

    return {
      allowed: count <= config.maxRequests,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      reset: resetTime,
    };
  } catch (error) {
    console.error('Redis rate limit error, falling back to in-memory:', error);
    return checkRateLimitMemory(keyId, config);
  }
}

/**
 * Rate limit using in-memory store (fallback)
 */
export function checkRateLimitMemory(
  keyId: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const limit = rateLimitStore.get(keyId);

  if (!limit || now > limit.resetTime) {
    const resetTime = now + config.windowMs;
    rateLimitStore.set(keyId, {
      count: 1,
      resetTime,
    });
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      reset: Math.floor(resetTime / 1000),
    };
  }

  limit.count += 1;

  return {
    allowed: limit.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - limit.count),
    reset: Math.floor(limit.resetTime / 1000),
  };
}

/**
 * Retrieves workspace-specific rate limit configuration from workspace_secrets
 */
async function getWorkspaceRateLimitConfig(
  wsId: string,
  secretName?: string
): Promise<Partial<RateLimitConfig> | null> {
  try {
    const { createDynamicAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const supabase = await createDynamicAdminClient();

    let query = supabase
      .from('workspace_secrets')
      .select('name, value')
      .eq('ws_id', wsId);

    if (secretName) {
      query = query.eq('name', secretName);
    } else {
      query = query.in('name', Object.values(RATE_LIMIT_SECRET_NAMES));
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return null;
    }

    const config: Partial<RateLimitConfig> = {};

    for (const secret of data) {
      if (!secret.value) continue;

      try {
        const numValue = Number.parseInt(secret.value, 10);
        if (Number.isNaN(numValue) || numValue <= 0) continue;

        switch (secret.name) {
          case RATE_LIMIT_SECRET_NAMES.WINDOW_MS:
            config.windowMs = numValue;
            break;
          case RATE_LIMIT_SECRET_NAMES.MAX_REQUESTS:
            config.maxRequests = numValue;
            break;
          default:
            break;
        }
      } catch {
        // Skip invalid values
      }
    }

    return Object.keys(config).length > 0 ? config : null;
  } catch (error) {
    console.error('Error fetching workspace rate limit config:', error);
    return null;
  }
}

/**
 * Gets the effective rate limit configuration for a workspace.
 * Merges workspace-specific config with provided defaults.
 */
async function getEffectiveRateLimitConfig(
  wsId: string,
  defaultConfig: RateLimitConfig
): Promise<RateLimitConfig> {
  const workspaceConfig = await getWorkspaceRateLimitConfig(wsId);

  if (!workspaceConfig) {
    return defaultConfig;
  }

  return {
    windowMs: workspaceConfig.windowMs ?? defaultConfig.windowMs,
    maxRequests: workspaceConfig.maxRequests ?? defaultConfig.maxRequests,
  };
}

/**
 * Checks if a request should be rate limited.
 * Uses Redis if available, falls back to in-memory store.
 * Adds standard X-RateLimit-* headers to response.
 * Supports workspace-specific rate limits via workspace_secrets.
 */
export async function checkRateLimit(
  keyId: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 },
  wsId?: string
): Promise<
  | { allowed: true; headers: Record<string, string> }
  | NextResponse<ApiErrorResponse>
> {
  const effectiveConfig = wsId
    ? await getEffectiveRateLimitConfig(wsId, config)
    : config;

  const result = await checkRateLimitRedis(keyId, effectiveConfig);

  const headers = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  };

  if (!result.allowed) {
    const resetIn = Math.max(1, result.reset - Math.floor(Date.now() / 1000));
    return createRateLimitErrorResponse(
      'Too Many Requests',
      `Rate limit exceeded. Try again in ${resetIn} seconds.`,
      429,
      'RATE_LIMIT_EXCEEDED',
      headers
    );
  }

  return { allowed: true, headers };
}
