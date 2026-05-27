import { updateSession } from '@tuturuuu/supabase/next/proxy';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  AuthenticatorAssuranceLevels,
  SupabaseUser,
} from '@tuturuuu/supabase/next/user';
import type { Database } from '@tuturuuu/types/db';
import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { AppCoordinationTokenClaims } from '../app-coordination';
import {
  clearSupabaseAuthCookies,
  getAppSessionRefreshEarlySeconds,
  getAppSessionRefreshTokenFromRequest,
  getAppSessionTokenFromRequest,
  getWebAppSessionRefreshTokenFromRequest,
  getWebAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '../app-session';
import {
  hashMfaMobileApprovalSecret,
  MFA_MOBILE_APPROVAL_COOKIE_NAME,
  MFA_MOBILE_APPROVAL_KIND,
  parseMfaMobileApprovalCookie,
} from '../mfa-mobile-approval';

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

function getSetCookieHeaders(headers: Headers) {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = withGetSetCookie.getSetCookie?.();

  if (setCookies?.length) {
    return setCookies;
  }

  const singleHeader = headers.get('set-cookie');
  return singleHeader ? [singleHeader] : [];
}

function parseCookieHeader(cookieHeader: string | null) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.trim().split('=');

    if (rawName) {
      cookies.set(rawName, rawValueParts.join('='));
    }
  }

  return cookies;
}

function updateCookieHeaderFromSetCookies(
  cookieHeader: string | null,
  setCookieHeaders: string[]
) {
  const cookies = parseCookieHeader(cookieHeader);

  for (const setCookie of setCookieHeaders) {
    const [cookiePair, ...attributes] = setCookie.split(';');
    const [rawName, ...rawValueParts] = cookiePair?.trim().split('=') ?? [];

    if (!rawName) {
      continue;
    }

    const maxAgeAttribute = attributes.find((attribute) =>
      attribute.trim().toLowerCase().startsWith('max-age=')
    );
    const maxAge = maxAgeAttribute
      ? Number.parseInt(maxAgeAttribute.split('=')[1] ?? '', 10)
      : null;

    if (maxAge === 0 || rawValueParts.length === 0) {
      cookies.delete(rawName);
      continue;
    }

    cookies.set(rawName, rawValueParts.join('='));
  }

  return [...cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function getRequestHeadersWithResponseCookies(
  req: NextRequest,
  response: NextResponse
) {
  const setCookieHeaders = getSetCookieHeaders(response.headers);

  if (setCookieHeaders.length === 0) {
    return req.headers;
  }

  const headers = new Headers(req.headers);
  const nextCookieHeader = updateCookieHeaderFromSetCookies(
    req.headers.get('cookie'),
    setCookieHeaders
  );

  if (nextCookieHeader) {
    headers.set('cookie', nextCookieHeader);
  } else {
    headers.delete('cookie');
  }

  return headers;
}

function copySetCookieHeaders(
  setCookieHeaders: string[],
  response: NextResponse
) {
  for (const setCookie of setCookieHeaders) {
    response.headers.append('set-cookie', setCookie);
  }
}

function createNextResponseWithRequestHeaders(headers?: Headers) {
  return headers
    ? NextResponse.next({
        request: {
          headers,
        },
      })
    : NextResponse.next();
}

type ConsumeVerifyTokenRequestOptions = {
  fallbackPath?: string;
  locales?: readonly string[];
  verifyApiPath?: string;
  verifyPath?: string;
};

function matchesVerifyTokenPath(
  pathname: string,
  options: Pick<ConsumeVerifyTokenRequestOptions, 'locales' | 'verifyPath'>
) {
  const verifyPath = options.verifyPath ?? '/verify-token';

  if (pathname === verifyPath) {
    return true;
  }

  const locales = options.locales ?? [];
  if (locales.length === 0) {
    return false;
  }

  const segments = pathname.split('/').filter(Boolean);
  const verifySegment = verifyPath.replace(/^\/+/u, '');

  return (
    segments.length === 2 &&
    segments[1] === verifySegment &&
    locales.includes(segments[0] ?? '')
  );
}

async function readVerifyTokenResponse(response: Response) {
  return response.json().catch(() => null) as Promise<{
    appSessionCreated?: unknown;
    userId?: unknown;
    valid?: unknown;
  } | null>;
}

function redirectToNormalizedVerifyTarget(req: NextRequest, nextPath: string) {
  return NextResponse.redirect(new URL(nextPath, req.nextUrl));
}

function redirectToVerifyFallback(
  req: NextRequest,
  fallbackPath: string,
  response?: NextResponse
) {
  return clearSupabaseAuthCookies(
    req,
    response ?? NextResponse.redirect(new URL(fallbackPath, req.nextUrl))
  );
}

export async function consumeVerifyTokenRequest(
  req: NextRequest,
  options: ConsumeVerifyTokenRequestOptions = {}
): Promise<NextResponse | null> {
  if (!matchesVerifyTokenPath(req.nextUrl.pathname, options)) {
    return null;
  }

  const fallbackPath = options.fallbackPath ?? '/';
  const nextPath = normalizeAuthRedirectPath(
    req.nextUrl.searchParams.get('nextUrl'),
    req.nextUrl.origin,
    fallbackPath
  );
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return clearSupabaseAuthCookies(
      req,
      redirectToNormalizedVerifyTarget(req, nextPath)
    );
  }

  const verifyUrl = new URL(
    options.verifyApiPath ?? '/api/auth/verify-app-token',
    req.nextUrl.origin
  );
  const verifyResponse = await fetch(verifyUrl, {
    body: JSON.stringify({ token }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    method: 'POST',
  }).catch(() => null);

  if (!verifyResponse?.ok) {
    return redirectToVerifyFallback(req, fallbackPath);
  }

  const body = await readVerifyTokenResponse(verifyResponse);

  if (
    body?.valid !== true ||
    body.appSessionCreated !== true ||
    typeof body.userId !== 'string'
  ) {
    return redirectToVerifyFallback(req, fallbackPath);
  }

  const redirectResponse = redirectToNormalizedVerifyTarget(req, nextPath);
  copySetCookieHeaders(
    getSetCookieHeaders(verifyResponse.headers),
    redirectResponse
  );

  return clearSupabaseAuthCookies(req, redirectResponse);
}

type AppSessionRefreshState =
  | {
      claims: AppCoordinationTokenClaims;
      ok: true;
      refreshed: boolean;
      requestHeaders?: Headers;
      response: NextResponse;
    }
  | {
      error: string;
      ok: false;
    };

export async function refreshAppSessionForRequest(
  req: NextRequest,
  options: {
    now?: Date;
    refreshPath?: string;
    targetApp: AppName | string;
  }
): Promise<AppSessionRefreshState> {
  const now = options.now ?? new Date();
  const verification = verifyAppSessionRequest(req, {
    now,
    targetApp: options.targetApp,
  });
  const accessToken =
    getWebAppSessionTokenFromRequest(req) ?? getAppSessionTokenFromRequest(req);
  const refreshToken =
    getWebAppSessionRefreshTokenFromRequest(req) ??
    getAppSessionRefreshTokenFromRequest(req);

  if (verification.ok) {
    const earlySeconds = getAppSessionRefreshEarlySeconds(verification.claims);
    const secondsUntilExpiry =
      verification.claims.exp - Math.floor(now.getTime() / 1000);

    if (!refreshToken || secondsUntilExpiry > earlySeconds) {
      return {
        claims: verification.claims,
        ok: true,
        refreshed: false,
        response: clearSupabaseAuthCookies(
          req,
          createNextResponseWithRequestHeaders()
        ),
      };
    }
  } else if (!refreshToken) {
    return verification;
  }

  const refreshUrl = new URL(
    options.refreshPath ?? '/api/auth/refresh-app-session',
    req.nextUrl.origin
  );
  const refreshResponse = await fetch(refreshUrl, {
    body: JSON.stringify({ accessToken, refreshToken }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    method: 'POST',
  }).catch(() => null);

  if (!refreshResponse?.ok) {
    if (verification.ok) {
      return {
        claims: verification.claims,
        ok: true,
        refreshed: false,
        response: clearSupabaseAuthCookies(
          req,
          createNextResponseWithRequestHeaders()
        ),
      };
    }

    return {
      error: 'Invalid app session refresh credentials',
      ok: false,
    };
  }

  const setCookieHeaders = getSetCookieHeaders(refreshResponse.headers);
  const requestHeaders = new Headers(req.headers);
  const nextCookieHeader = updateCookieHeaderFromSetCookies(
    req.headers.get('cookie'),
    setCookieHeaders
  );

  if (nextCookieHeader) {
    requestHeaders.set('cookie', nextCookieHeader);
  } else {
    requestHeaders.delete('cookie');
  }

  const refreshedVerification = verifyAppSessionRequest(
    {
      headers: requestHeaders,
    },
    {
      now,
      targetApp: options.targetApp,
    }
  );

  if (!refreshedVerification.ok) {
    return refreshedVerification;
  }

  const response = clearSupabaseAuthCookies(
    req,
    createNextResponseWithRequestHeaders(requestHeaders)
  );
  copySetCookieHeaders(setCookieHeaders, response);

  return {
    claims: refreshedVerification.claims,
    ok: true,
    refreshed: true,
    requestHeaders,
    response,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function clearMfaMobileApprovalCookie(response: NextResponse) {
  response.cookies.set(MFA_MOBILE_APPROVAL_COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

function sessionIdFromClaims(claims: unknown) {
  const sessionId = asRecord(claims).session_id;
  return typeof sessionId === 'string' && sessionId ? sessionId : null;
}

async function hasValidMobileMfaApproval(
  req: NextRequest,
  userId: string | null | undefined,
  sessionId: string | null | undefined
): Promise<boolean> {
  if (!userId || !sessionId) {
    return false;
  }

  const cookiePayload = parseMfaMobileApprovalCookie(
    req.cookies.get(MFA_MOBILE_APPROVAL_COOKIE_NAME)?.value
  );

  if (!cookiePayload) {
    return false;
  }

  try {
    const admin = await createAdminClient<Database>({ noCookie: true });
    const secretHash = await hashMfaMobileApprovalSecret(cookiePayload.secret);
    const { data, error } = await admin
      .from('qr_login_challenges')
      .select('approval_metadata, approver_user_id, request_metadata, status')
      .eq('id', cookiePayload.challengeId)
      .eq('secret_hash', secretHash)
      .eq('approver_user_id', userId)
      .maybeSingle();

    if (error || !data || data.status !== 'consumed') {
      return false;
    }

    const requestMetadata = asRecord(data.request_metadata);
    if (requestMetadata.kind !== MFA_MOBILE_APPROVAL_KIND) {
      return false;
    }

    const approvalMetadata = asRecord(data.approval_metadata);
    if (approvalMetadata.approverSessionId !== sessionId) {
      return false;
    }

    const validUntil = approvalMetadata.mobileMfaValidUntil;

    return (
      typeof validUntil === 'string' &&
      Number.isFinite(Date.parse(validUntil)) &&
      Date.parse(validUntil) > Date.now()
    );
  } catch {
    return false;
  }
}

/**
 * Handles MFA verification checks for authenticated users
 */
async function handleMFACheck(
  req: NextRequest,
  aal: AuthenticatorAssuranceLevels | null,
  userId: string | null | undefined,
  sessionId: string | null | undefined,
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
      if (await hasValidMobileMfaApproval(req, userId, sessionId)) {
        return null;
      }

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

        const redirectResponse = NextResponse.redirect(loginUrl);
        clearMfaMobileApprovalCookie(redirectResponse);
        return redirectResponse;
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

        const redirectResponse = NextResponse.redirect(loginUrl);
        clearMfaMobileApprovalCookie(redirectResponse);
        return redirectResponse;
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

  /**
   * Registered satellite apps use Tuturuuu-managed app-session JWTs instead
   * of app-local Supabase Auth sessions.
   */
  appSession?: {
    now?: Date;
    targetApp: AppName | string;
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
    appSession,
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
      const isPublic =
        (!excludeRootPath && req.nextUrl.pathname === '/') ||
        publicPaths.some((path) => req.nextUrl.pathname.startsWith(path)) ||
        isPublicPath?.(req.nextUrl.pathname);

      if (appSession) {
        const appSessionVerification = await refreshAppSessionForRequest(req, {
          now: appSession.now,
          targetApp: appSession.targetApp,
        });

        if (!appSessionVerification.ok && !isPublic) {
          if (req.nextUrl.pathname.startsWith('/api')) {
            return clearSupabaseAuthCookies(
              req,
              NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            );
          }

          const loginUrl = new URL('/login', webAppUrl);
          loginUrl.searchParams.set(
            'returnUrl',
            buildCentralizedReturnUrl(req, webAppUrl)
          );

          return clearSupabaseAuthCookies(req, NextResponse.redirect(loginUrl));
        }

        return appSessionVerification.ok
          ? appSessionVerification.response
          : clearSupabaseAuthCookies(req, NextResponse.next());
      }

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

      // If the user is not authenticated and the path is not public, redirect to the central login page
      if (!claims && !isPublic) {
        const loginUrl = new URL('/login', webAppUrl);
        loginUrl.searchParams.set(
          'returnUrl',
          buildCentralizedReturnUrl(req, webAppUrl)
        );

        const redirectResponse = NextResponse.redirect(loginUrl);
        propagateAuthCookies(res, redirectResponse);

        return redirectResponse;
      }

      // If user is authenticated and MFA is enabled, check MFA requirements
      if (claims && mfaEnabled) {
        const mfaRedirect = await handleMFACheck(
          req,
          claims.aal,
          claims.sub,
          sessionIdFromClaims(claims),
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
