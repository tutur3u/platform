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
import {
  MAX_PAYLOAD_SIZE,
  MAX_REQUEST_BODY_BYTES,
} from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, type RateLimitConfig } from './rate-limit';

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
    /**
     * Maximum allowed payload size in bytes.
     * Defaults to MAX_PAYLOAD_SIZE (1MB).
     */
    maxPayloadSize?: number;
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

    // Check payload size
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      const limit = options?.maxPayloadSize ?? MAX_PAYLOAD_SIZE;

      if (size > limit) {
        return createErrorResponse(
          'Payload Too Large',
          'Request body exceeds limit',
          413,
          'PAYLOAD_TOO_LARGE'
        );
      }
    }

    // Extract IP and User-Agent
    const ipAddress = extractIPFromHeaders(request.headers);
    const userAgent = request.headers.get('user-agent') || null;
    const isRead = method === 'GET' || method === 'HEAD';

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

      // IP-based rate limit BEFORE auth — reject floods cheaply
      if (options?.rateLimit !== false) {
        const preAuthConfig =
          options?.rateLimit ??
          (isRead ? false : { windowMs: 60000, maxRequests: 120 });

        if (preAuthConfig !== false) {
          const preAuthResult = await checkRateLimit(
            `ip:${isRead ? 'read' : 'mutate'}:${ipAddress}`,
            preAuthConfig
          );
          if (!('allowed' in preAuthResult)) {
            return preAuthResult;
          }
        }
      }
    }

    // Authenticate the request (expensive: validates API key against DB)
    const authResult = await authenticateRequest(request);

    if ('context' in authResult) {
      const { context } = authResult;

      // Check rate limit if enabled (default: GET/HEAD open, mutations limited)
      // Workspace-specific limits from workspace_secrets will override defaults
      let rateLimitHeaders: Record<string, string> = {};
      if (options?.rateLimit !== false) {
        const rateLimitConfig =
          options?.rateLimit ??
          (isRead
            ? false
            : {
                windowMs: 60000,
                maxRequests: 100,
              });

        if (rateLimitConfig !== false) {
          const rateLimitResult = await checkRateLimit(
            `${context.keyId}:${isRead ? 'read' : 'mutate'}`,
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

export {
  checkRateLimit,
  RATE_LIMIT_SECRET_NAMES,
  type RateLimitConfig,
} from './rate-limit';

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
 * Validates request body using Zod schema with byte-size enforcement.
 *
 * Reads raw body text, checks UTF-8 byte length against maxBytes
 * (default: MAX_REQUEST_BODY_BYTES), then parses as JSON and validates
 * with the provided Zod schema.
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: { parse: (data: unknown) => T },
  maxBytes: number = MAX_REQUEST_BODY_BYTES
): Promise<{ data: T } | NextResponse<ApiErrorResponse>> {
  try {
    // Read raw body text and check byte size
    const text = await request.text();
    const byteLength = new TextEncoder().encode(text).length;

    if (byteLength > maxBytes) {
      return createErrorResponse(
        'Payload Too Large',
        `Request body is ${byteLength} bytes, exceeding the ${maxBytes} byte limit`,
        413,
        'PAYLOAD_TOO_LARGE'
      );
    }

    const body = JSON.parse(text);
    const data = schema.parse(body);
    return { data };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse(
        'Bad Request',
        'Invalid JSON in request body',
        400,
        'INVALID_JSON'
      );
    }
    console.error('Request body validation error:', error);
    return createErrorResponse(
      'Bad Request',
      'Invalid request body',
      400,
      'INVALID_REQUEST_BODY'
    );
  }
}
