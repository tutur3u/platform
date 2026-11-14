import { updateSession } from '@tuturuuu/supabase/next/proxy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { AuthenticatorAssuranceLevels } from '@tuturuuu/supabase/next/user';
import type { Database } from '@tuturuuu/types/db';
import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { discardAppCookiesForVerifiedProvider } from '@tuturuuu/utils/required-mfa-credentials';
import { enforceRequiredMfaRequest } from '@tuturuuu/utils/required-mfa-runtime';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { AppCoordinationTokenClaims } from '../app-coordination';
import {
  clearAppSessionCookie,
  clearSupabaseAuthCookies,
  createAppSessionToken,
  hasSupportedSupabaseAuthCookie,
} from '../app-session';
import {
  hashMfaMobileApprovalSecret,
  MFA_MOBILE_APPROVAL_COOKIE_NAME,
  MFA_MOBILE_APPROVAL_KIND,
  parseMfaMobileApprovalCookie,
} from '../mfa-mobile-approval';
import {
  extractForwardedHeaderValue,
  isLoopbackBrowserHostname,
  resolveCanonicalRequestOrigin,
} from './canonical-origin';
import { appSessionFailureResponse } from './mfa-failure';
import {
  decodeURIComponentSafely,
  normalizeAuthRedirectPath,
  withRequestBasePath,
} from './redirect-path';
import {
  copySetCookieHeaders,
  createNextResponseWithRequestHeaders,
  getSetCookieHeaders,
} from './response-cookies';
import {
  type AppSessionRefreshState,
  resolveSignedAppSessionForRequest,
} from './signed-refresh';
import { createAppSessionClaimsFromSupabaseClaims } from './supabase-app-claims';
import {
  bindRequestAppToken,
  hasVerifiedTotpFactor,
} from './verified-request-user';
import {
  readVerifyTokenResponse,
  redirectToNormalizedVerifyTarget,
  redirectToVerifyFallback,
} from './verify-token-redirect';

export {
  normalizeCanonicalOrigins,
  resolveCanonicalRequestOrigin,
} from './canonical-origin';
export {
  appSessionFailureResponse,
  preserveMfaRecoveryCookies,
} from './mfa-failure';
export {
  normalizeAuthRedirectPath,
  withRequestBasePath,
} from './redirect-path';
export { getRequestHeadersWithResponseCookies } from './response-cookies';

const AUTH_REDIRECT_CACHE_CONTROL = 'private, no-store';

function shouldPreserveCentralLoopbackCookies(
  req: NextRequest,
  webAppUrl: string
): boolean {
  try {
    const requestUrl = req.nextUrl;
    const centralUrl = new URL(webAppUrl);

    return (
      isLoopbackBrowserHostname(requestUrl.hostname) &&
      isLoopbackBrowserHostname(centralUrl.hostname) &&
      requestUrl.hostname === centralUrl.hostname &&
      requestUrl.origin !== centralUrl.origin
    );
  } catch {
    return false;
  }
}

function buildCentralizedReturnUrl(
  req: NextRequest,
  webAppUrl: string,
  canonicalOrigins: readonly string[],
  rawTargetPath?: string | null
): string | null {
  const publicOrigin = resolveCanonicalRequestOrigin(
    req,
    webAppUrl,
    canonicalOrigins
  );
  if (!publicOrigin) {
    return null;
  }
  const normalizedTargetPath = normalizeAuthRedirectPath(
    rawTargetPath ?? `${req.nextUrl.pathname}${req.nextUrl.search}`,
    publicOrigin,
    '/'
  );
  const verifyUrl = new URL(
    withRequestBasePath(req, '/verify-token'),
    publicOrigin
  );
  verifyUrl.searchParams.set('nextUrl', normalizedTargetPath);
  return verifyUrl.toString();
}

/**
 * Central login URL for a signed-out request. The return URL is omitted when
 * the app has no valid canonical origin, so a header value is never reflected.
 */
function buildCentralLoginUrl(
  req: NextRequest,
  webAppUrl: string,
  canonicalOrigins: readonly string[]
): URL {
  const loginUrl = new URL('/login', webAppUrl);
  const returnUrl = buildCentralizedReturnUrl(req, webAppUrl, canonicalOrigins);
  if (returnUrl) {
    loginUrl.searchParams.set('returnUrl', returnUrl);
  }
  return loginUrl;
}

/** Auth redirects carry per-user state; never let a shared cache keep them. */
function authRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', AUTH_REDIRECT_CACHE_CONTROL);
  return response;
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
  const setCookieHeaders = getSetCookieHeaders(source.headers);

  if (setCookieHeaders.length > 0) {
    copySetCookieHeaders(setCookieHeaders, target);
    return;
  }

  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

type ConsumeVerifyTokenRequestOptions = {
  fallbackPath?: string;
  locales?: readonly string[];
  verifyApiPath?: string;
  verifyPath?: string;
};

function isTuturuuuLocalhost(hostname: string) {
  return (
    hostname === 'tuturuuu.localhost' ||
    hostname.endsWith('.tuturuuu.localhost')
  );
}

function getRequestHostnames(req: NextRequest) {
  return [
    req.nextUrl.hostname,
    extractForwardedHeaderValue(req.headers.get('host')),
    extractForwardedHeaderValue(req.headers.get('x-forwarded-host')),
  ].flatMap((host) => {
    if (!host) {
      return [];
    }

    try {
      return [new URL(`http://${host}`).hostname];
    } catch {
      return [];
    }
  });
}

function isTuturuuuLocalhostRequest(req: NextRequest) {
  return getRequestHostnames(req).some(isTuturuuuLocalhost);
}

function getLocalPortlessAuthApiUrl(req: NextRequest, apiPath: string) {
  const port = process.env.PORT?.trim();

  if (
    process.env.NODE_ENV === 'production' ||
    !port ||
    !/^\d+$/u.test(port) ||
    !isTuturuuuLocalhostRequest(req)
  ) {
    return null;
  }
  return new URL(withRequestBasePath(req, apiPath), `http://127.0.0.1:${port}`);
}

function getAuthApiUrl(req: NextRequest, apiPath: string) {
  return (
    getLocalPortlessAuthApiUrl(req, apiPath) ??
    new URL(withRequestBasePath(req, apiPath), req.url)
  );
}

function shouldUseClientVerifyTokenFlow(req: NextRequest) {
  return (
    process.env.NODE_ENV !== 'production' &&
    (isTuturuuuLocalhostRequest(req) ||
      (isLoopbackBrowserHostname(req.nextUrl.hostname) &&
        req.nextUrl.port.length > 0))
  );
}

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

export async function consumeVerifyTokenRequest(
  req: NextRequest,
  options: ConsumeVerifyTokenRequestOptions = {}
): Promise<NextResponse | null> {
  if (!matchesVerifyTokenPath(req.nextUrl.pathname, options)) {
    return null;
  }

  if (shouldUseClientVerifyTokenFlow(req)) {
    return null;
  }

  const fallbackPath = options.fallbackPath ?? '/';
  const nextPath = normalizeAuthRedirectPath(
    req.nextUrl.searchParams.get('nextUrl'),
    req.nextUrl.origin,
    fallbackPath
  );
  // A mounted app shares the root session: a handoff token is never redeemed
  // on the apex (its verify endpoint is refused there), and the shared
  // session cookie is never touched, so the verifier only forwards.
  if (req.nextUrl.basePath) {
    return redirectToNormalizedVerifyTarget(req, nextPath);
  }

  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return clearSupabaseAuthCookies(
      req,
      redirectToNormalizedVerifyTarget(req, nextPath)
    );
  }

  const verifyUrl = getAuthApiUrl(
    req,
    options.verifyApiPath ?? '/api/auth/verify-app-token'
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

function createSupabaseBackedAppSessionResponse(
  req: NextRequest,
  res: NextResponse,
  claims: AppCoordinationTokenClaims,
  options: {
    now: Date;
    targetApp: AppName | string;
  }
) {
  const nowSeconds = Math.floor(options.now.getTime() / 1000);
  const secondsUntilExpiry = claims.exp - nowSeconds;
  const { token } = createAppSessionToken(
    {
      // SR-926: claims.email was re-read from confirmed Auth for this mint by
      // createAppSessionClaimsFromSupabaseClaims; it is never a provider claim.
      email: claims.email ?? undefined,
      mfa: claims.mfa,
      expiresInSeconds: Math.max(1, secondsUntilExpiry),
      scopes: claims.scopes,
      targetApp: options.targetApp,
      userId: claims.sub,
    },
    { now: options.now }
  );
  bindRequestAppToken(req, token, claims.sub);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('authorization', `Bearer ${token}`);
  req.headers.set('authorization', `Bearer ${token}`);
  const response = createNextResponseWithRequestHeaders(requestHeaders);
  copySetCookieHeaders(getSetCookieHeaders(res.headers), response);
  clearAppSessionCookie(response);
  return { requestHeaders, response };
}

export async function refreshAppSessionForRequest(
  request: NextRequest,
  options: Parameters<typeof resolveAppSessionForRequest>[1]
): Promise<AppSessionRefreshState> {
  try {
    return await resolveAppSessionForRequest(request, options);
  } catch {
    return { ok: false, error: 'Account assurance unavailable' };
  }
}

async function resolveAppSessionForRequest(
  req: NextRequest,
  options: {
    now?: Date;
    requireWebAppSession?: boolean;
    refreshPath?: string;
    sessionMode?: 'app-session' | 'supabase-first';
    targetApp: AppName | string;
  }
): Promise<AppSessionRefreshState> {
  const now = options.now ?? new Date();

  if (
    options.sessionMode === 'supabase-first' &&
    hasSupportedSupabaseAuthCookie(req)
  ) {
    const { res, claims } = await updateSession(req);
    if (claims && !req.headers.has('authorization'))
      discardAppCookiesForVerifiedProvider(req);
    const appSessionClaims = await createAppSessionClaimsFromSupabaseClaims(
      claims,
      { now, request: req, targetApp: options.targetApp }
    );

    if (claims && !appSessionClaims)
      return { error: 'MFA required', ok: false, response: res };
    if (appSessionClaims) {
      if (
        await requiresMfaVerification(
          req,
          aalFromClaims(claims),
          appSessionClaims.sub,
          sessionIdFromClaims(claims)
        )
      ) {
        return {
          error: 'MFA required',
          ok: false,
          response: res,
        };
      }

      const { requestHeaders, response } =
        createSupabaseBackedAppSessionResponse(req, res, appSessionClaims, {
          now,
          targetApp: options.targetApp,
        });

      return {
        claims: appSessionClaims,
        ok: true,
        refreshed: false,
        requestHeaders,
        response,
      };
    }
  }

  return resolveSignedAppSessionForRequest(req, options, () =>
    getAuthApiUrl(req, options.refreshPath ?? '/api/auth/refresh-app-session')
  );
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

function aalFromClaims(claims: unknown): AuthenticatorAssuranceLevels | null {
  const aal = asRecord(claims).aal;

  return aal === 'aal1' || aal === 'aal2' ? aal : null;
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

async function requiresMfaVerification(
  req: NextRequest,
  aal: AuthenticatorAssuranceLevels | null,
  userId: string | null | undefined,
  sessionId: string | null | undefined
) {
  const assurance = await enforceRequiredMfaRequest(req);
  if (assurance?.status === 503)
    throw new Error('Account assurance unavailable');
  if (assurance) return true;
  const hasVerifiedMFA = await hasVerifiedTotpFactor(req, userId);

  if (!(hasVerifiedMFA && aal === 'aal1')) {
    return false;
  }

  return !(await hasValidMobileMfaApproval(req, userId, sessionId));
}

async function handleMFACheck(
  req: NextRequest,
  aal: AuthenticatorAssuranceLevels | null,
  userId: string | null | undefined,
  sessionId: string | null | undefined,
  webAppUrl: string,
  canonicalOrigins: readonly string[],
  protectedPaths: string[],
  excludedPaths: string[],
  enforceForAll: boolean
): Promise<NextResponse | null> {
  const pathname = req.nextUrl.pathname;

  if (excludedPaths.some((path) => pathname.startsWith(path))) {
    return null;
  }

  const needsMFA =
    enforceForAll || protectedPaths.some((path) => pathname.startsWith(path));

  if (!needsMFA) {
    return null;
  }

  try {
    if (await requiresMfaVerification(req, aal, userId, sessionId)) {
      const publicOrigin = resolveCanonicalRequestOrigin(
        req,
        webAppUrl,
        canonicalOrigins
      );
      const centralOrigin = new URL(webAppUrl).origin;

      const isCentralWebApp = publicOrigin === centralOrigin;

      if (isCentralWebApp) {
        const nextUrl = normalizeAuthRedirectPath(
          req.nextUrl.searchParams.get('nextUrl') ??
            `${req.nextUrl.pathname}${req.nextUrl.search}`,
          centralOrigin,
          '/'
        );

        const loginUrl = new URL('/login', centralOrigin);
        loginUrl.searchParams.set('nextUrl', nextUrl);
        loginUrl.searchParams.set('mfa', 'required');

        const redirectResponse = authRedirect(loginUrl);
        clearMfaMobileApprovalCookie(redirectResponse);
        return redirectResponse;
      } else {
        const existingReturnUrl = req.nextUrl.searchParams.get('returnUrl');
        const returnUrl =
          existingReturnUrl &&
          publicOrigin &&
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

            return buildCentralizedReturnUrl(
              req,
              webAppUrl,
              canonicalOrigins,
              decodedValue
            );
          })();

        const loginUrl = returnUrl
          ? new URL('/login', webAppUrl)
          : buildCentralLoginUrl(req, webAppUrl, canonicalOrigins);
        if (returnUrl) {
          loginUrl.searchParams.set('returnUrl', returnUrl);
        }
        loginUrl.searchParams.set('mfa', 'required');

        const redirectResponse = authRedirect(loginUrl);
        clearMfaMobileApprovalCookie(redirectResponse);
        return redirectResponse;
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking MFA:', error);
    return NextResponse.json(
      { error: 'Unable to verify account security' },
      { status: 503 }
    );
  }
}

interface CentralizedAuthOptions {
  /**
   * The URL of the central authentication web app (without trailing slash)
   */
  webAppUrl: string;

  /**
   * This app's own canonical public origin(s), normally `[BASE_URL]`.
   *
   * Required. Auth return URLs use a request's `X-Forwarded-Host` or `Host`
   * only when it names one of these origins (or the central `webAppUrl`), or
   * when the request carries a verified gateway origin proof. Anything else
   * falls back to the first valid origin here; with none, central login gets
   * no return URL. Header values are never reflected otherwise.
   */
  canonicalOrigins: readonly string[];

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
    sessionMode?: 'app-session' | 'supabase-first';
    targetApp: AppName | string;
  };
}

export function createCentralizedAuthProxy(options: CentralizedAuthOptions) {
  const {
    webAppUrl,
    canonicalOrigins,
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
        if (
          appSession.sessionMode === 'supabase-first' &&
          hasSupportedSupabaseAuthCookie(req)
        ) {
          const { res, claims } = await updateSession(req);

          if (claims) {
            if (!req.headers.has('authorization'))
              discardAppCookiesForVerifiedProvider(req);
            const claimsRecord = asRecord(claims);
            const userId =
              typeof claimsRecord.sub === 'string' ? claimsRecord.sub : null;
            const mfaRedirect = await handleMFACheck(
              req,
              aalFromClaims(claims),
              userId,
              sessionIdFromClaims(claims),
              webAppUrl,
              canonicalOrigins,
              mfaProtectedPaths,
              mfaExcludedPaths,
              mfaEnforceForAll
            );

            if (mfaRedirect) {
              propagateAuthCookies(res, mfaRedirect);
              clearAppSessionCookie(mfaRedirect);
              return mfaRedirect;
            }

            const now = appSession.now ?? new Date();
            const appSessionClaims =
              await createAppSessionClaimsFromSupabaseClaims(claims, {
                now,
                request: req,
                targetApp: appSession.targetApp,
              });

            if (appSessionClaims) {
              return createSupabaseBackedAppSessionResponse(
                req,
                res,
                appSessionClaims,
                {
                  now,
                  targetApp: appSession.targetApp,
                }
              ).response;
            }

            const required = authRedirect(
              new URL('/login?mfa=required', webAppUrl)
            );
            propagateAuthCookies(res, required);
            return required;
          }
        }

        const appSessionVerification = await refreshAppSessionForRequest(req, {
          now: appSession.now,
          sessionMode: appSession.sessionMode,
          targetApp: appSession.targetApp,
        });

        if (!appSessionVerification.ok && !isPublic) {
          if (
            req.nextUrl.pathname.startsWith('/api') ||
            appSessionVerification.error === 'Account assurance unavailable' ||
            appSessionVerification.error === 'App session refresh unavailable'
          ) {
            return appSessionFailureResponse(
              req,
              appSessionVerification.error,
              appSessionVerification.response
            );
          }

          const loginUrl = buildCentralLoginUrl(
            req,
            webAppUrl,
            canonicalOrigins
          );

          const redirectResponse = authRedirect(loginUrl);
          if (appSessionVerification.error === 'MFA required') {
            loginUrl.searchParams.set('mfa', 'required');
            const required = authRedirect(loginUrl);
            for (const cookie of appSessionVerification.response?.headers.getSetCookie() ??
              [])
              required.headers.append('set-cookie', cookie);
            return required;
          }
          return shouldPreserveCentralLoopbackCookies(req, webAppUrl)
            ? redirectResponse
            : clearSupabaseAuthCookies(req, redirectResponse);
        }

        if (appSessionVerification.ok) return appSessionVerification.response;
        return clearSupabaseAuthCookies(req, NextResponse.next());
      }

      if (skipApiRoutes && req.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.next();
      }

      const { res, claims } = await updateSession(req);
      if (claims && !req.headers.has('authorization')) {
        discardAppCookiesForVerifiedProvider(req);
        res.headers.set('x-middleware-override-headers', 'cookie');
        res.headers.set(
          'x-middleware-request-cookie',
          req.headers.get('cookie') ?? ''
        );
      }

      if (!claims && !isPublic) {
        const loginUrl = buildCentralLoginUrl(req, webAppUrl, canonicalOrigins);

        const redirectResponse = authRedirect(loginUrl);
        propagateAuthCookies(res, redirectResponse);

        return redirectResponse;
      }

      if (claims && mfaEnabled) {
        const mfaRedirect = await handleMFACheck(
          req,
          claims.aal,
          claims.sub,
          sessionIdFromClaims(claims),
          webAppUrl,
          canonicalOrigins,
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
      return appSessionFailureResponse(req, 'Account assurance unavailable');
    }
  };
}
