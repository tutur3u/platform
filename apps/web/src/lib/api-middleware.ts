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
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Extended request with workspace context
 */
export interface AuthenticatedRequest extends NextRequest {
  workspaceContext?: WorkspaceContext;
}

/**
 * Standard API error response
 */
interface ApiErrorResponse {
  error: string;
  message: string;
  code?: string;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: string,
  message: string,
  status: number,
  code?: string
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error,
      message,
      ...(code && { code }),
    },
    { status }
  );
}

/**
 * Extracts the API key from the Authorization header
 * Supports "Bearer <key>" format
 */
export function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // Support "Bearer <key>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Also support raw key (for backwards compatibility)
  if (authHeader.startsWith('ttr_')) {
    return authHeader;
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
      'MISSING_API_KEY'
    );
  }

  const context = await validateApiKey(apiKey);

  if (!context) {
    return createErrorResponse(
      'Unauthorized',
      'Invalid or expired API key',
      401,
      'INVALID_API_KEY'
    );
  }

  return { context };
}

/**
 * Checks if the workspace context has the required permissions
 */
export function checkPermissions(
  context: WorkspaceContext,
  requiredPermissions: string[],
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
    permissions?: string[];
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
 * Rate limiting configuration (optional enhancement)
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

/**
 * Simple in-memory rate limiter (for production, use Redis or similar)
 * This is a basic implementation - consider using a dedicated rate limiting service
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Checks if a request should be rate limited
 */
export function checkRateLimit(
  keyId: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 }
): { allowed: true } | NextResponse<ApiErrorResponse> {
  const now = Date.now();
  const limit = rateLimitStore.get(keyId);

  if (!limit || now > limit.resetTime) {
    // First request or window expired
    rateLimitStore.set(keyId, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { allowed: true };
  }

  if (limit.count >= config.maxRequests) {
    // Rate limit exceeded
    const resetIn = Math.ceil((limit.resetTime - now) / 1000);
    return createErrorResponse(
      'Too Many Requests',
      `Rate limit exceeded. Try again in ${resetIn} seconds.`,
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }

  // Increment counter
  limit.count += 1;
  return { allowed: true };
}

/**
 * Validates query parameters using Zod schema
 */
export function validateQueryParams<T>(
  request: NextRequest,
  schema: { parse: (data: unknown) => T }
): { data: T } | NextResponse<ApiErrorResponse> {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
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
