import { updateSession } from '@tuturuuu/supabase/next/proxy';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { discardAppCookiesForVerifiedProvider } from '@tuturuuu/utils/required-mfa-credentials';
import { enforceRequiredMfaRequest } from '@tuturuuu/utils/required-mfa-runtime';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { hasSupportedSupabaseAuthCookie } from '../app-session';
import { authRedirect } from './central-login-url';
import {
  mountedSessionFailureResponse,
  nonExpiringCookieCarrier,
  withoutExpiringCookies,
} from './mounted-failure';
import {
  copySetCookieHeaders,
  createNextResponseWithRequestHeaders,
  getSetCookieHeaders,
  propagateAuthCookies,
} from './response-cookies';
import type { AppSessionRefreshState } from './signed-refresh';
import { createAppSessionClaimsFromSupabaseClaims } from './supabase-app-claims';
import { peekVerifiedTotpFactor } from './verified-request-user';

/**
 * Opt-in `supabase-only` session mode for an app mounted on the apex
 * (`https://tuturuuu.com/<app>`). It accepts only the shared provider session:
 * app-session cookies and Authorization are discarded, the signed-refresh
 * fallback is never used, and verified TOTP enrollment requires AAL2. A refusal never
 * carries a provider refresh's cookie deletions, because Web owns those cookies.
 */
export type MountedSharedSessionOptions = {
  mode: 'supabase-only';
  nextUrlScope?: 'app-relative';
  targetApp: AppName | string;
  webAppUrl: string;
};

const NOT_FOUND_HEADERS = { 'Cache-Control': 'private, no-store' };
const UNAVAILABLE = 'Shared session unavailable';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trustedSharedMount(req: NextRequest, targetApp: AppName | string) {
  return (
    /^[a-z][a-z0-9-]*$/u.test(targetApp) &&
    targetApp !== 'api' &&
    req.nextUrl.origin === 'https://tuturuuu.com' &&
    req.nextUrl.basePath === `/${targetApp}`
  );
}

function refused(error: string, res: NextResponse): AppSessionRefreshState {
  return { ok: false, error, response: withoutExpiringCookies(res) };
}

export async function resolveMountedSharedSession(
  req: NextRequest,
  options: { now: Date; targetApp: AppName | string }
): Promise<AppSessionRefreshState> {
  if (!trustedSharedMount(req, options.targetApp))
    return { ok: false, error: UNAVAILABLE };
  discardAppCookiesForVerifiedProvider(req);
  req.headers.delete('authorization');
  if (!hasSupportedSupabaseAuthCookie(req))
    return { ok: false, error: UNAVAILABLE };

  const { res, claims } = await updateSession(req);
  const record = asRecord(claims);
  if (
    typeof record.sub !== 'string' ||
    !record.sub ||
    typeof record.exp !== 'number' ||
    !Number.isFinite(record.exp) ||
    record.exp <= Math.floor(options.now.getTime() / 1000) ||
    (record.aal !== undefined && record.aal !== 'aal1' && record.aal !== 'aal2')
  )
    return refused(UNAVAILABLE, res);

  const assurance = await enforceRequiredMfaRequest(req);
  if (assurance)
    return refused(
      assurance.status === 503
        ? 'Account assurance unavailable'
        : 'MFA required',
      res
    );
  // Bind enrollment to the user revalidated on this request. The provider's
  // verified AAL is required alongside Web's account assurance policy.
  const totp = peekVerifiedTotpFactor(req, record.sub);
  if (totp === null) return refused('Account assurance unavailable', res);
  if (totp && record.aal !== 'aal2') return refused('MFA required', res);

  const appClaims = await createAppSessionClaimsFromSupabaseClaims(claims, {
    now: options.now,
    request: req,
    targetApp: options.targetApp,
  });
  if (!appClaims) return refused('MFA required', res);

  const requestHeaders = new Headers(req.headers);
  const response = createNextResponseWithRequestHeaders(requestHeaders);
  copySetCookieHeaders(getSetCookieHeaders(res.headers), response);
  return {
    ok: true,
    claims: appClaims,
    refreshed: false,
    requestHeaders,
    response,
  };
}

/** A same-origin destination inside the mount, or the mount root. */
export function mountedVerifyDestination(
  req: NextRequest,
  basePath: string,
  scope?: MountedSharedSessionOptions['nextUrlScope']
) {
  const raw = req.nextUrl.searchParams.get('nextUrl');
  if (!raw) return basePath;
  if (
    /[\\\u0000- ]/u.test(raw) ||
    raw.startsWith('//') ||
    (!raw.startsWith('/') &&
      (scope === 'app-relative' || !raw.startsWith('https://')))
  )
    return basePath;
  try {
    const destination = new URL(
      scope === 'app-relative' ? `${basePath}${raw}` : raw,
      req.nextUrl.origin
    );
    let pathname = destination.pathname;
    for (let depth = 0; depth < 5; depth += 1) {
      if (
        destination.origin !== req.nextUrl.origin ||
        destination.username ||
        destination.password ||
        (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) ||
        /[\\\u0000- ]/u.test(pathname)
      )
        return basePath;
      const decoded = decodeURIComponent(pathname);
      const normalized = new URL(decoded, req.nextUrl.origin);
      if (normalized.origin !== req.nextUrl.origin) return basePath;
      if (decoded === pathname) {
        const targetPath = destination.pathname.replace(/\/+$/u, '');
        if (
          ['/login', '/verify-token', '/api/auth/callback'].some(
            (path) => targetPath === `${basePath}${path}`
          )
        )
          return basePath;
        return `${targetPath}${destination.search}${destination.hash}`;
      }
      pathname = normalized.pathname;
    }
  } catch {
    return basePath;
  }
  return basePath;
}

/**
 * The mounted verify-token step: a valid shared session redirects into the
 * mount; otherwise the central login returns here. An unavailable refresh or
 * assurance check answers here instead, since the still-valid central session
 * would send the login straight back. `refresh` is the caller's logout-fenced
 * session resolver. Redirects are 307 with `private, no-store`.
 */
export async function consumeMountedSharedSession(
  req: NextRequest,
  options: MountedSharedSessionOptions,
  deps: {
    refresh: (
      req: NextRequest,
      options: { sessionMode: 'supabase-only'; targetApp: AppName | string }
    ) => Promise<AppSessionRefreshState>;
  }
) {
  if (!trustedSharedMount(req, options.targetApp))
    return new NextResponse('Not Found', {
      status: 404,
      headers: NOT_FOUND_HEADERS,
    });
  const basePath = req.nextUrl.basePath;
  const destination = mountedVerifyDestination(
    req,
    basePath,
    options.nextUrlScope
  );
  const session = await deps.refresh(req, {
    sessionMode: options.mode,
    targetApp: options.targetApp,
  });
  if (
    !session.ok &&
    (session.error === 'Account assurance unavailable' ||
      session.error === 'App session refresh unavailable')
  )
    return mountedSessionFailureResponse(req, session.error, session.response);
  if (!session.ok) {
    const login = new URL('/login', options.webAppUrl);
    if (
      login.origin !== 'https://tuturuuu.com' ||
      login.username ||
      login.password
    )
      return new NextResponse('Not Found', {
        status: 404,
        headers: NOT_FOUND_HEADERS,
      });
    const callback = new URL(`${basePath}/verify-token`, req.nextUrl.origin);
    const relative = destination.slice(basePath.length);
    callback.searchParams.set(
      'nextUrl',
      options.nextUrlScope === 'app-relative'
        ? relative.startsWith('/')
          ? relative
          : `/${relative}`
        : destination
    );
    login.searchParams.set('returnUrl', callback.toString());
    if (session.error === 'MFA required')
      login.searchParams.set('mfa', 'required');
    const response = authRedirect(login);
    propagateAuthCookies(nonExpiringCookieCarrier(session.response), response);
    return response;
  }
  const response = authRedirect(new URL(destination, req.nextUrl.origin));
  propagateAuthCookies(session.response, response);
  return response;
}
