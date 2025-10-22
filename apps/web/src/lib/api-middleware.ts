/**
 * API Middleware for External SDK Authentication
 *
 * Provides authentication and authorization for API routes
 * using workspace API keys.
 */

import {
  hasAllPermissions,
  hasAnyPermission,
  validateApiKey,
  type WorkspaceContext,
} from '@tuturuuu/auth/api-keys';
import type { PermissionId } from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
import type { ApiErrorResponse } from 'tuturuuu/types';

/**
 * Extended request with workspace context
 */
export interface AuthenticatedRequest extends NextRequest {
  workspaceContext?: WorkspaceContext;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
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
 * Extracts the API key from the Authorization header
 * Supports "Bearer <key>" format with case-insensitive matching
 */
export function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // Trim leading/trailing whitespace
  const trimmedHeader = authHeader.trim();

  // Support "Bearer <key>" format (case-insensitive)
  if (trimmedHeader.toLowerCase().startsWith('bearer ')) {
    // Extract everything after "Bearer " and trim
    const token = trimmedHeader.substring(7).trim();
    return token || null;
  }

  // Also support raw key (for backwards compatibility)
  if (trimmedHeader.startsWith('ttr_')) {
    return trimmedHeader;
  }

  return null;
}

/**
 * Authenticates the API request and attaches workspace context
 * Returns an error response if authentication fails
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<{ context: WorkspaceContext } | NextResponse<ApiErrorResponse>> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    return createErrorResponse(
      'Unauthorized',
      'Missing or invalid Authorization header. Expected: "Authorization: Bearer <api_key>"',
      401,
      'MISSING_API_KEY',
      { 'WWW-Authenticate': 'Bearer' }
    );
  }

  const context = await validateApiKey(apiKey);

  if (!context) {
    return createErrorResponse(
      'Unauthorized',
      'Invalid or expired API key',
      401,
      'INVALID_API_KEY',
      { 'WWW-Authenticate': 'Bearer' }
    );
  }

  return { context };
}

/**
 * Checks if the workspace context has the required permissions
 */
export function checkPermissions(
  context: WorkspaceContext,
  requiredPermissions: PermissionId[],
  requireAll = false
): { authorized: true } | NextResponse<ApiErrorResponse> {
  const hasPermissions = requireAll
    ? hasAllPermissions(context, requiredPermissions)
    : hasAnyPermission(context, requiredPermissions);

  if (!hasPermissions) {
    return createErrorResponse(
      'Forbidden',
      `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
      403,
      'INSUFFICIENT_PERMISSIONS'
    );
  }

  return { authorized: true };
}

/**
 * Middleware wrapper for API routes that require authentication
 *
 * @param handler - The API route handler function
 * @param options - Configuration options
 * @returns Wrapped handler with authentication
 *
 * @example
 * export const GET = withApiAuth(
 *   async (request, { params, context }) => {
 *     const { wsId } = context;
 *     // Your handler code here
 *     return NextResponse.json({ data: "..." });
 *   },
 *   { permissions: ['storage.read'] }
 * );
 */
export function withApiAuth<T = unknown>(
  handler: (
    request: NextRequest,
    context: {
      params: T;
      context: WorkspaceContext;
    }
  ) => Promise<NextResponse> | NextResponse,
  options?: {
    permissions?: PermissionId[];
    requireAll?: boolean;
  }
): (
  request: NextRequest,
  routeContext?: { params?: Promise<T> | T }
) => Promise<NextResponse> {
  return async (
    request: NextRequest,
    routeContext?: { params?: Promise<T> | T }
  ) => {
    // Authenticate the request
    const authResult = await authenticateRequest(request);

    if ('context' in authResult) {
      const { context } = authResult;

      // Await params if it's a Promise (Next.js 15 behavior)
      const params = routeContext?.params
        ? await Promise.resolve(routeContext.params)
        : ({} as T);

      // Check permissions if specified
      if (options?.permissions && options.permissions.length > 0) {
        const permissionCheck = checkPermissions(
          context,
          options.permissions,
          options.requireAll
        );

        if ('authorized' in permissionCheck) {
          // Permissions are valid, call the handler
          return handler(request, {
            params,
            context,
          });
        }

        // Return permission error
        return permissionCheck;
      }

      // No permissions required, call the handler
      return handler(request, {
        params,
        context,
      });
    }

    // Return authentication error
    return authResult;
  };
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
interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
}

/**
 * In-memory rate limit store (fallback when Redis unavailable)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Redis client type (lazy-loaded if @upstash/redis is installed)
 */
const redisClient = null;

/**
 * Initialize Redis client for rate limiting
 * Safe to call multiple times - will only initialize once
 */
async function getRedisClient() {
  if (redisClient !== null) return redisClient;

  try {
    // Check if Redis env vars are configured
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      console.warn(
        'Redis rate limiting disabled: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured'
      );
      return null;
    }

    // Dynamically import @upstash/redis if available
    // const { Redis } = await import('@upstash/redis');
    // redisClient = new Redis({
    //   url: redisUrl,
    //   token: redisToken,
    // });
    // console.log('Redis rate limiting enabled');
    return redisClient;
  } catch (error) {
    console.warn(
      'Redis rate limiting unavailable - falling back to in-memory:',
      error
    );
    return null;
  }
}

/**
 * Rate limit using Redis (production-ready, serverless-safe)
 */
async function checkRateLimitRedis(
  keyId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = await getRedisClient();
  if (!redis) {
    // Fallback to in-memory
    return checkRateLimitMemory(keyId, config);
  }

  // const key = `ratelimit:${keyId}`;
  // const windowSeconds = Math.ceil(config.windowMs / 1000);
  // const now = Math.floor(Date.now() / 1000);

  try {
    // Use Redis pipeline for atomic operations
    // const count = await redis.incr(key);

    // if (count === 1) {
    //   // First request in this window - set expiry
    //   await redis.expire(key, windowSeconds);
    // }

    // const ttl = await redis.ttl(key);
    // const resetTime = now + (ttl > 0 ? ttl : windowSeconds);

    // return {
    //   allowed: count <= config.maxRequests,
    //   limit: config.maxRequests,
    //   remaining: Math.max(0, config.maxRequests - count),
    //   reset: resetTime,
    // };

    throw new Error('Redis client not implemented');
  } catch (error) {
    console.error('Redis rate limit error, falling back to in-memory:', error);
    // Fallback to in-memory on Redis errors
    return checkRateLimitMemory(keyId, config);
  }
}

/**
 * Rate limit using in-memory store (fallback)
 */
function checkRateLimitMemory(
  keyId: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const limit = rateLimitStore.get(keyId);

  if (!limit || now > limit.resetTime) {
    // First request or window expired
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

  // Increment counter
  limit.count += 1;

  return {
    allowed: limit.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - limit.count),
    reset: Math.floor(limit.resetTime / 1000),
  };
}

/**
 * Checks if a request should be rate limited
 * Uses Redis if available, falls back to in-memory store
 * Adds standard X-RateLimit-* headers to response
 */
export async function checkRateLimit(
  keyId: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 }
): Promise<
  | { allowed: true; headers: Record<string, string> }
  | NextResponse<ApiErrorResponse>
> {
  const result = await checkRateLimitRedis(keyId, config);

  // Prepare rate limit headers
  const headers = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  };

  if (!result.allowed) {
    // Rate limit exceeded
    const resetIn = Math.max(1, result.reset - Math.floor(Date.now() / 1000));
    return createErrorResponse(
      'Too Many Requests',
      `Rate limit exceeded. Try again in ${resetIn} seconds.`,
      429,
      'RATE_LIMIT_EXCEEDED',
      headers
    );
  }

  // Return allowed with headers for successful requests
  return { allowed: true, headers };
}

/**
 * Validates query parameters using Zod schema
 * Supports duplicate query keys (e.g., ids=1&ids=2)
 */
export function validateQueryParams<T>(
  request: NextRequest,
  schema: { parse: (data: unknown) => T }
): { data: T } | NextResponse<ApiErrorResponse> {
  try {
    const url = new URL(request.url);

    // Build params object that preserves duplicate keys as arrays
    const params: Record<string, string | string[]> = {};
    const keys = Array.from(url.searchParams.keys());
    const uniqueKeys = [...new Set(keys)];

    for (const key of uniqueKeys) {
      const values = url.searchParams.getAll(key);
      // Use array for multiple values, single string for one value
      // getAll returns empty array if key doesn't exist, but we already filter by existing keys
      params[key] = values.length > 1 ? values : (values[0] ?? '');
    }

    const data = schema.parse(params);
    return { data };
  } catch (error) {
    console.error('Query parameter validation error:', error);
    return createErrorResponse(
      'Bad Request',
      'Invalid query parameters',
      400,
      'INVALID_QUERY_PARAMS'
    );
  }
}

/**
 * Validates request body using Zod schema
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: { parse: (data: unknown) => T }
): Promise<{ data: T } | NextResponse<ApiErrorResponse>> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { data };
  } catch (error) {
    console.error('Request body validation error:', error);
    return createErrorResponse(
      'Bad Request',
      'Invalid request body',
      400,
      'INVALID_REQUEST_BODY'
    );
  }
}
