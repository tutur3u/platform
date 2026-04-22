import { updateSession } from '@tuturuuu/supabase/next/proxy';
import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  AuthenticatorAssuranceLevels,
  SupabaseUser,
} from '@tuturuuu/supabase/next/user';
import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const INTERNAL_HOSTNAME_PATTERN =
  /^(?:0\.0\.0\.0|127(?:\.\d+){0,3}|localhost|::1|\[::1\]|host\.docker\.internal)$/u;
const AUTH_LOOP_PATHS = new Set([
  '/api/auth/callback',
  '/login',
  '/verify-token',
]);
const AUTH_REDIRECT_MAX_DEPTH = 5;

function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractForwardedHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [firstValue] = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return firstValue || null;
}

function isInternalHostname(hostname: string): boolean {
  return INTERNAL_HOSTNAME_PATTERN.test(hostname);
}

export function resolveCanonicalRequestOrigin(
  req: NextRequest,
  webAppUrl: string
): string {
  const fallbackOrigin = new URL(webAppUrl).origin;
  const forwardedHost = extractForwardedHeaderValue(
    req.headers.get('x-forwarded-host')
  );
  const forwardedProto =
    extractForwardedHeaderValue(req.headers.get('x-forwarded-proto')) ??
    req.nextUrl.protocol.replace(/:$/u, '');

  if (forwardedHost) {
    try {
      const forwardedOrigin = new URL(
        `${forwardedProto || 'https'}://${forwardedHost}`
      ).origin;
      if (!isInternalHostname(new URL(forwardedOrigin).hostname)) {
        return forwardedOrigin;
      }
    } catch {
      // Ignore malformed forwarded headers and fall back to safer origins.
    }
  }

  if (!isInternalHostname(req.nextUrl.hostname)) {
    return req.nextUrl.origin;
  }

  return fallbackOrigin;
}

export function normalizeAuthRedirectPath(
  rawValue: string | null | undefined,
  requestOrigin: string,
  fallbackPath = '/'
): string {
  if (!rawValue) {
    return fallbackPath;
  }

  let candidate = decodeURIComponentSafely(rawValue);

  for (let depth = 0; depth < AUTH_REDIRECT_MAX_DEPTH; depth += 1) {
    let url: URL;

    try {
      url = new URL(candidate, requestOrigin);
    } catch {
      return fallbackPath;
    }

    if (url.origin !== requestOrigin) {
      return fallbackPath;
    }

    if (AUTH_LOOP_PATHS.has(url.pathname)) {
      const nestedValue =
        url.searchParams.get('nextUrl') ?? url.searchParams.get('returnUrl');

      if (!nestedValue) {
        return fallbackPath;
      }

      candidate = decodeURIComponentSafely(nestedValue);
      continue;
    }

    return `${url.pathname}${url.search}`;
  }

  return fallbackPath;
}

function buildCentralizedReturnUrl(
  req: NextRequest,
  webAppUrl: string,
  rawTargetPath?: string | null
): string {
  const publicOrigin = resolveCanonicalRequestOrigin(req, webAppUrl);
  const normalizedTargetPath = normalizeAuthRedirectPath(
    rawTargetPath ?? `${req.nextUrl.pathname}${req.nextUrl.search}`,
    publicOrigin,
    '/'
  );
  const verifyUrl = new URL('/verify-token', publicOrigin);
  verifyUrl.searchParams.set('nextUrl', normalizedTargetPath);
  return verifyUrl.toString();
}

/**
 * Copies all cookies from one NextResponse onto another.
 * Use this to preserve auth cookies set by `updateSession` when the
 * final response is a fresh object (e.g. from locale middleware or a redirect).
 */
export function propagateAuthCookies(
  source: NextResponse,
  target: NextResponse
): void {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

/**
 * Handles MFA verification checks for authenticated users
 */
async function handleMFACheck(
  req: NextRequest,
  aal: AuthenticatorAssuranceLevels | null,
  webAppUrl: string,
  protectedPaths: string[],
  excludedPaths: string[],
  enforceForAll: boolean
): Promise<NextResponse | null> {
  const pathname = req.nextUrl.pathname;

  // Skip if path is excluded
  if (excludedPaths.some((path) => pathname.startsWith(path))) {
    return null;
  }

  // Check if this path requires MFA
  const needsMFA =
    enforceForAll || protectedPaths.some((path) => pathname.startsWith(path));

  if (!needsMFA) {
    return null;
  }

  try {
    const supabase = await createClient();

    // Check if user has verified MFA factors
    const { data: factors } = await supabase.auth.mfa.listFactors();

    const hasVerifiedMFA =
      factors?.totp?.some((factor) => factor.status === 'verified') || false;

    // User needs MFA verification if:
    // 1. They have verified MFA factors set up
    // 2. Current AAL is aal1 (basic auth only, MFA not verified in this session)
    const requiresMFAVerification = hasVerifiedMFA && aal === 'aal1';

    if (requiresMFAVerification) {
      const publicOrigin = resolveCanonicalRequestOrigin(req, webAppUrl);
      const centralOrigin = new URL(webAppUrl).origin;

      // Check if this is the central web app handling MFA
      const isCentralWebApp = publicOrigin === centralOrigin;

      if (isCentralWebApp) {
        // Handle MFA verification in the login page
        // Preserve existing nextUrl if it exists, otherwise use current path
        const nextUrl = normalizeAuthRedirectPath(
          req.nextUrl.searchParams.get('nextUrl') ??
            `${req.nextUrl.pathname}${req.nextUrl.search}`,
          publicOrigin,
          '/'
        );

        const loginUrl = new URL('/login', centralOrigin);
        loginUrl.searchParams.set('nextUrl', nextUrl);
        loginUrl.searchParams.set('mfa', 'required');

        return NextResponse.redirect(loginUrl);
      } else {
        // All other apps redirect to central web app for MFA verification
        // Route through /verify-token so cross-app tokens are properly consumed
        const existingReturnUrl = req.nextUrl.searchParams.get('returnUrl');
        const returnUrl =
          existingReturnUrl &&
          (() => {
            const decodedValue = decodeURIComponentSafely(existingReturnUrl);

            try {
              const parsedValue = new URL(decodedValue, publicOrigin);
              if (
                parsedValue.origin !== publicOrigin &&
                parsedValue.origin !== centralOrigin
              ) {
                return parsedValue.toString();
              }
            } catch {
              // Fall back to a rebuilt centralized return URL below.
            }

            return buildCentralizedReturnUrl(req, webAppUrl, decodedValue);
          })();

        const loginUrl = new URL('/login', webAppUrl);
        loginUrl.searchParams.set(
          'returnUrl',
          returnUrl ?? buildCentralizedReturnUrl(req, webAppUrl)
        );
        loginUrl.searchParams.set('mfa', 'required');

        return NextResponse.redirect(loginUrl);
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking MFA:', error);
    return null;
  }
}

interface CentralizedAuthOptions {
  /**
   * The URL of the central authentication web app (without trailing slash)
   */
  webAppUrl: string;

  /**
   * Public paths that don't require authentication
   */
  publicPaths?: string[];

  /**
   * Whether to exclude the root path from authentication checks
   * @default false
   */
  excludeRootPath?: boolean;

  /**
   * Callback function to determine if a path should be public
   */
  isPublicPath?: (pathname: string) => boolean;

  /**
   * Whether to skip authentication checks for API routes
   * @default true
   */
  skipApiRoutes?: boolean;

  /**
   * MFA configuration options
   */
  mfa?: {
    /**
     * Whether to enable MFA enforcement
     * @default true
     */
    enabled?: boolean;

    /**
     * Paths that require MFA
     */
    protectedPaths?: string[];

    /**
     * Paths that are excluded from MFA checks
     */
    excludedPaths?: string[];

    /**
     * Whether to enforce MFA for all authenticated routes
     * @default true
     */
    enforceForAll?: boolean;
  };
}

/**
 * Creates a middleware handler that redirects unauthenticated users to the central web app login page
 */
export function createCentralizedAuthProxy(options: CentralizedAuthOptions) {
  const {
    webAppUrl,
    publicPaths = [],
    excludeRootPath = false,
    isPublicPath,
    skipApiRoutes = true,
    mfa = {},
  } = options;

  const {
    enabled: mfaEnabled = true,
    protectedPaths: mfaProtectedPaths = [],
    excludedPaths: mfaExcludedPaths = ['/api/', '/login'],
    enforceForAll: mfaEnforceForAll = true,
  } = mfa;

  return async function authProxy(req: NextRequest): Promise<NextResponse> {
    // Global payload size check at the edge
    const contentLength = req.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > MAX_PAYLOAD_SIZE) {
        return NextResponse.json(
          { error: 'Payload Too Large', message: 'Request body exceeds limit' },
          { status: 413 }
        );
      }
    }

    try {
      if (skipApiRoutes && req.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.next();
      }

      // Make sure user session is always refreshed
      const { res, claims } = await updateSession(req);

      // If we should skip API routes and the current path starts with /api, return without redirecting
      if (skipApiRoutes && req.nextUrl.pathname.startsWith('/api')) {
        // console.log('Skipping API route:', req.nextUrl.pathname);
        return res;
      } else {
        // console.log('Not skipping API route:', req.nextUrl.pathname);
      }

      // Determine if the current path is public
      const isPublic =
        (!excludeRootPath && req.nextUrl.pathname === '/') ||
        publicPaths.some((path) => req.nextUrl.pathname.startsWith(path)) ||
        isPublicPath?.(req.nextUrl.pathname);

      // If the user is not authenticated and the path is not public, redirect to the central login page
      if (!claims && !isPublic) {
        const loginUrl = new URL('/login', webAppUrl);
        loginUrl.searchParams.set(
          'returnUrl',
          buildCentralizedReturnUrl(req, webAppUrl)
        );

        console.log('Redirecting to:', loginUrl.toString());
        const redirectResponse = NextResponse.redirect(loginUrl);
        propagateAuthCookies(res, redirectResponse);

        return redirectResponse;
      }

      // If user is authenticated and MFA is enabled, check MFA requirements
      if (claims && mfaEnabled) {
        const mfaRedirect = await handleMFACheck(
          req,
          claims.aal,
          webAppUrl,
          mfaProtectedPaths,
          mfaExcludedPaths,
          mfaEnforceForAll
        );

        if (mfaRedirect) {
          propagateAuthCookies(res, mfaRedirect);
          return mfaRedirect;
        }
      }

      return res;
    } catch (error) {
      console.error('Error updating session:', error);
      return NextResponse.redirect(new URL('/', req.nextUrl));
    }
  };
}

/**
 * Creates a redirect handler for the central web app to redirect back to the original app after login
 */
export function createReturnUrlHandler(
  req: NextRequest,
  user: SupabaseUser | null
): NextResponse | null {
  if (user) {
    // Get the returnUrl from the query parameters
    const returnUrl = req.nextUrl.searchParams.get('returnUrl');

    if (returnUrl) {
      try {
        // Decode and validate the returnUrl
        const decodedUrl = decodeURIComponent(returnUrl);
        const url = new URL(decodedUrl);

        // Redirect to the returnUrl
        const redirectResponse = NextResponse.redirect(url);

        return redirectResponse;
      } catch (error) {
        console.error('Invalid returnUrl:', error);
      }
    }
  }

  // Return null if we shouldn't redirect
  return null;
}
