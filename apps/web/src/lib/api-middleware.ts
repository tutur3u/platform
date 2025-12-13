/**
 * API Middleware for External SDK Authentication
 *
 * Provides authentication and authorization for API routes
 * using workspace API keys.
 */

import {
  hasAllPermissions,
  hasAnyPermission,
  logApiKeyUsage,
  validateApiKey,
  type WorkspaceContext,
} from '@tuturuuu/auth/api-keys';
import type { PermissionId } from '@tuturuuu/types';
import type { ApiErrorResponse } from '@tuturuuu/types/sdk';
import {
  extractIPFromHeaders,
  isIPBlocked,
} from '@tuturuuu/utils/abuse-protection';
import { type NextRequest, NextResponse } from 'next/server';

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
 *   {
 *     permissions: ['storage.read'],
 *     rateLimit: { windowMs: 60000, maxRequests: 100 }
 *   }
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
    rateLimit?: RateLimitConfig | false;
  }
): (
  request: NextRequest,
  routeContext?: { params?: Promise<T> | T }
) => Promise<NextResponse> {
  return async (
    request: NextRequest,
    routeContext?: { params?: Promise<T> | T }
  ) => {
    const startTime = Date.now();
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const method = request.method;

    // Extract IP and User-Agent
    const ipAddress = extractIPFromHeaders(request.headers);
    const userAgent = request.headers.get('user-agent') || null;

    // Enforce persistent IP blocks (shared across services)
    if (ipAddress && ipAddress !== 'unknown') {
      const blockInfo = await isIPBlocked(ipAddress);
      if (blockInfo) {
        const retryAfter = Math.max(
          1,
          Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
        );

        return createErrorResponse(
          'Too Many Requests',
          'Rate limit exceeded',
          429,
          'IP_BLOCKED',
          {
            'Retry-After': `${retryAfter}`,
          }
        );
      }
    }

    // Authenticate the request
    const authResult = await authenticateRequest(request);

    if ('context' in authResult) {
      const { context } = authResult;

      // Check rate limit if enabled (default: enabled with 100 requests per minute)
      // Workspace-specific limits from workspace_secrets will override defaults
      let rateLimitHeaders: Record<string, string> = {};
      if (options?.rateLimit !== false) {
        const rateLimitConfig = options?.rateLimit || {
          windowMs: 60000,
          maxRequests: 100,
        };
        const rateLimitResult = await checkRateLimit(
          context.keyId,
          rateLimitConfig,
          context.wsId // Pass wsId to check for workspace-specific config
        );

        if ('allowed' in rateLimitResult) {
          // Rate limit check returned success with headers
          rateLimitHeaders = rateLimitResult.headers;
        } else {
          // Rate limit exceeded - log and return error response
          const responseTimeMs = Date.now() - startTime;
          void logApiKeyUsage({
            apiKeyId: context.keyId,
            wsId: context.wsId,
            endpoint,
            method,
            statusCode: 429,
            ipAddress,
            userAgent,
            responseTimeMs,
            requestParams: Object.fromEntries(url.searchParams),
            errorMessage: 'Rate limit exceeded',
          });
          return rateLimitResult;
        }
      }

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
          try {
            const response = await handler(request, {
              params,
              context,
            });

            // Add rate limit headers to response
            for (const [key, value] of Object.entries(rateLimitHeaders)) {
              response.headers.set(key, value);
            }

            // Log successful request
            const responseTimeMs = Date.now() - startTime;
            void logApiKeyUsage({
              apiKeyId: context.keyId,
              wsId: context.wsId,
              endpoint,
              method,
              statusCode: response.status,
              ipAddress,
              userAgent,
              responseTimeMs,
              requestParams: Object.fromEntries(url.searchParams),
            });

            return response;
          } catch (error) {
            // Log failed request
            const responseTimeMs = Date.now() - startTime;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';

            void logApiKeyUsage({
              apiKeyId: context.keyId,
              wsId: context.wsId,
              endpoint,
              method,
              statusCode: 500,
              ipAddress,
              userAgent,
              responseTimeMs,
              requestParams: Object.fromEntries(url.searchParams),
              errorMessage,
            });

            throw error;
          }
        }

        // Log permission error
        const responseTimeMs = Date.now() - startTime;
        void logApiKeyUsage({
          apiKeyId: context.keyId,
          wsId: context.wsId,
          endpoint,
          method,
          statusCode: 403,
          ipAddress,
          userAgent,
          responseTimeMs,
          requestParams: Object.fromEntries(url.searchParams),
          errorMessage: 'Insufficient permissions',
        });

        // Return permission error
        return permissionCheck;
      }

      // No permissions required, call the handler
      try {
        const response = await handler(request, {
          params,
          context,
        });

        // Add rate limit headers to response
        for (const [key, value] of Object.entries(rateLimitHeaders)) {
          response.headers.set(key, value);
        }

        // Log successful request
        const responseTimeMs = Date.now() - startTime;
        void logApiKeyUsage({
          apiKeyId: context.keyId,
          wsId: context.wsId,
          endpoint,
          method,
          statusCode: response.status,
          ipAddress,
          userAgent,
          responseTimeMs,
          requestParams: Object.fromEntries(url.searchParams),
        });

        return response;
      } catch (error) {
        // Log failed request
        const responseTimeMs = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        void logApiKeyUsage({
          apiKeyId: context.keyId,
          wsId: context.wsId,
          endpoint,
          method,
          statusCode: 500,
          ipAddress,
          userAgent,
          responseTimeMs,
          requestParams: Object.fromEntries(url.searchParams),
          errorMessage,
        });

        throw error;
      }
    }

    // Return authentication error (no logging for invalid auth)
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
let redisClient: Awaited<
  ReturnType<typeof import('@upstash/redis').Redis.fromEnv>
> | null = null;
let redisInitialized = false;

/**
 * Initialize Redis client for rate limiting
 * Safe to call multiple times - will only initialize once
 */
async function getRedisClient() {
  if (redisInitialized) return redisClient;

  try {
    // Check if Redis env vars are configured
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      console.warn(
        'Redis rate limiting disabled: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured'
      );
      redisInitialized = true;
      return null;
    }

    // Dynamically import @upstash/redis if available
    const { Redis } = await import('@upstash/redis');
    redisClient = Redis.fromEnv();
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
async function checkRateLimitRedis(
  keyId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = await getRedisClient();
  if (!redis) {
    // Fallback to in-memory
    return checkRateLimitMemory(keyId, config);
  }

  const key = `ratelimit:${keyId}`;
  const windowSeconds = Math.ceil(config.windowMs / 1000);
  const now = Math.floor(Date.now() / 1000);

  try {
    // Use Redis pipeline for atomic operations
    const count = await redis.incr(key);

    if (count === 1) {
      // First request in this window - set expiry
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
 * Retrieves workspace-specific rate limit configuration from workspace_secrets
 * @param wsId - The workspace ID
 * @param secretName - Optional specific secret name to retrieve
 * @returns Rate limit configuration from workspace secrets, or null if not found
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

    // Build query for workspace secrets
    let query = supabase
      .from('workspace_secrets')
      .select('name, value')
      .eq('ws_id', wsId);

    if (secretName) {
      query = query.eq('name', secretName);
    } else {
      // Get all rate limit related secrets
      query = query.in('name', Object.values(RATE_LIMIT_SECRET_NAMES));
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return null;
    }

    // Parse the secrets into a config object
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
          // Note: Operation-specific limits are handled at the route level
          default:
            break;
        }
      } catch {
        // Skip invalid values - no action needed
      }
    }

    return Object.keys(config).length > 0 ? config : null;
  } catch (error) {
    console.error('Error fetching workspace rate limit config:', error);
    return null;
  }
}

/**
 * Gets the effective rate limit configuration for a workspace
 * Merges workspace-specific config with provided defaults
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
 * Checks if a request should be rate limited
 * Uses Redis if available, falls back to in-memory store
 * Adds standard X-RateLimit-* headers to response
 * Supports workspace-specific rate limits via workspace_secrets
 */
export async function checkRateLimit(
  keyId: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 },
  wsId?: string
): Promise<
  | { allowed: true; headers: Record<string, string> }
  | NextResponse<ApiErrorResponse>
> {
  // Get workspace-specific config if wsId provided
  const effectiveConfig = wsId
    ? await getEffectiveRateLimitConfig(wsId, config)
    : config;

  const result = await checkRateLimitRedis(keyId, effectiveConfig);

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
