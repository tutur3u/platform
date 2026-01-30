import { NextResponse } from 'next/server';
import { Agent, fetch as undiciFetch } from 'undici';
import { DEV_MODE } from '@/constants/common';
import { checkRateLimit, type RateLimitConfig } from '@/lib/api-middleware';

// Custom dispatcher with increased header size limit (128KB)
// This prevents HeadersOverflowError when external API returns many headers
const customAgent = DEV_MODE
  ? new Agent({
      maxHeaderSize: 128 * 1024, // 128KB (default is ~16KB)
    })
  : undefined;

// Default Tuturuuu API endpoint (production v2)
const DEFAULT_TUTURUUU_API_ENDPOINT = 'https://tuturuuu.com/api/v2';

// Allowlist of trusted Tuturuuu API domains to prevent SSRF attacks
const ALLOWED_API_DOMAINS = [
  'tuturuuu.com',
  'www.tuturuuu.com',
  'api.tuturuuu.com',
  'staging.tuturuuu.com',
  'dev.tuturuuu.com',
  // Local development
  'localhost',
  '127.0.0.1',
];

// Allowed ports for local development to prevent SSRF to internal services
const ALLOWED_LOCAL_PORTS = [3000, 7803, 8080];

/**
 * Validate that the path parameter is safe and doesn't contain URL manipulation
 */
function isValidApiPath(path: string): boolean {
  // Path must start with /
  if (!path.startsWith('/')) {
    return false;
  }

  // Prevent protocol-relative URLs and other bypass attempts
  if (path.startsWith('//') || path.includes('://')) {
    return false;
  }

  // Prevent path traversal
  if (path.includes('..')) {
    return false;
  }

  return true;
}

// Default rate limit for proxy: 60 requests per minute
// Can be overridden via workspace secrets (RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)
const DEFAULT_PROXY_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000, // 1 minute
  maxRequests: 60, // 60 requests per minute
};

/**
 * Extract IP address from request headers
 */
function getClientIP(request: Request): string {
  const headers = request.headers;
  // Check common headers for client IP
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }
  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}

/**
 * Proxy route to avoid CORS issues when fetching from Tuturuuu production API.
 *
 * The browser cannot directly call tuturuuu.com due to CORS restrictions.
 * This server-side proxy makes the request on behalf of the client.
 *
 * Rate Limited: Uses Redis-backed rate limiting with workspace-specific config support.
 * Default: 60 requests/minute per IP+API key combination.
 * Override via workspace_secrets: RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS
 *
 * Usage:
 *   GET /api/v1/proxy/tuturuuu?path=/workspaces/[id]&wsId=[targetWsId]&apiUrl=[customApiUrl]
 *   Headers: X-Tuturuuu-Api-Key: <api-key>
 *
 * Parameters:
 *   - path: API path to call (required)
 *   - wsId: Target workspace ID for rate limit config lookup (optional)
 *   - apiUrl: Custom Tuturuuu API base URL (optional, defaults to https://tuturuuu.com/api/v2)
 */
export async function GET(request: Request) {
  if (!DEV_MODE) {
    return NextResponse.json(
      { message: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const wsId = searchParams.get('wsId'); // Target workspace ID for rate limit config
    const apiUrl = searchParams.get('apiUrl'); // Custom API URL (optional)

    // Get API key and client IP for rate limit key
    const apiKey = request.headers.get('X-Tuturuuu-Api-Key');
    const clientIP = getClientIP(request);

    // Create rate limit key from IP + truncated API key hash
    // This prevents one user from affecting another's rate limit
    const apiKeyHash = apiKey ? apiKey.substring(0, 8) : 'no-key';
    const rateLimitKey = `proxy:tuturuuu:${clientIP}:${apiKeyHash}`;

    // Check rate limit using Redis (with workspace-specific config if wsId provided)
    const rateLimitResult = await checkRateLimit(
      rateLimitKey,
      DEFAULT_PROXY_RATE_LIMIT,
      wsId ?? undefined
    );

    // If rate limit exceeded, checkRateLimit returns a NextResponse directly
    if (!('allowed' in rateLimitResult)) {
      return rateLimitResult;
    }

    const rateLimitHeaders = rateLimitResult.headers;

    if (!path) {
      return NextResponse.json(
        { message: 'Missing path query parameter' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { message: 'Missing X-Tuturuuu-Api-Key header' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    // Validate path to prevent URL manipulation attacks
    if (!isValidApiPath(path)) {
      return NextResponse.json(
        { message: 'Invalid path parameter' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Build the full URL to Tuturuuu API
    // Use custom apiUrl if provided, otherwise default to production v2
    const baseUrl = apiUrl || DEFAULT_TUTURUUU_API_ENDPOINT;

    // SECURITY: Parse and validate the base URL using a strict allowlist.
    // This prevents SSRF attacks where an attacker could make the server
    // fetch internal resources or arbitrary external URLs.
    let base: URL;
    try {
      base = new URL(baseUrl);
    } catch {
      return NextResponse.json(
        {
          message: 'Invalid API URL format.',
        },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const isLocalhost =
      base.hostname === 'localhost' || base.hostname === '127.0.0.1';

    // For localhost, validate port is allowed to prevent SSRF to internal services
    if (isLocalhost) {
      const port = base.port
        ? parseInt(base.port, 10)
        : base.protocol === 'https:'
          ? 443
          : 80;
      if (!ALLOWED_LOCAL_PORTS.includes(port)) {
        return NextResponse.json(
          {
            message: 'Invalid API URL port for localhost.',
          },
          { status: 400, headers: rateLimitHeaders }
        );
      }
    }

    // Only allow HTTPS for remote hosts; allow HTTP only for explicit localhost/127.0.0.1.
    if (
      (!isLocalhost && base.protocol !== 'https:') ||
      (isLocalhost && base.protocol !== 'http:' && base.protocol !== 'https:')
    ) {
      return NextResponse.json(
        {
          message: 'Invalid API URL protocol.',
        },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!ALLOWED_API_DOMAINS.includes(base.hostname)) {
      return NextResponse.json(
        {
          message:
            'Invalid API URL. Only trusted Tuturuuu domains are allowed.',
        },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Path is already validated by isValidApiPath (starts with '/', no '..' segments)
    // Construct the base API URL using origin (scheme + host + optional port).
    const baseOrigin = `${base.protocol}//${base.host}`;
    const urlObject = new URL(path, baseOrigin);

    // Forward any additional query parameters (except 'path', 'wsId', and 'apiUrl')
    const forwardParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== 'path' && key !== 'wsId' && key !== 'apiUrl') {
        forwardParams.append(key, value);
      }
    });

    // Append forwarded query parameters to the URL object.
    forwardParams.forEach((value, key) => {
      urlObject.searchParams.append(key, value);
    });
    const finalUrl = urlObject.toString();

    // Make the request to Tuturuuu API using Bearer token (SDK authentication)
    // Use undici with custom agent to handle large response headers
    const response = await undiciFetch(finalUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      dispatcher: customAgent,
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Non-JSON response (likely an error page)
      const text = await response.text();
      console.error(
        'Tuturuuu API returned non-JSON response:',
        text.substring(0, 200)
      );
      return NextResponse.json(
        {
          message: 'Tuturuuu API returned non-JSON response',
          status: response.status,
        },
        { status: response.status || 502, headers: rateLimitHeaders }
      );
    }

    // Get the response data
    const data = await response.json();

    // Return the response with the same status code and rate limit headers
    return NextResponse.json(data, {
      status: response.status,
      headers: rateLimitHeaders,
    });
  } catch (error) {
    console.error('Error in Tuturuuu proxy:', error);
    return NextResponse.json(
      { message: 'Failed to proxy request to Tuturuuu API' },
      { status: 500 }
    );
  }
}
