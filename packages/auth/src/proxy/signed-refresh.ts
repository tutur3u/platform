import type { AppName } from '@tuturuuu/utils/internal-domains';
import { resolveRequiredMfaAppSessionAuthority } from '@tuturuuu/utils/required-mfa-app-session';
import type { NextRequest, NextResponse } from 'next/server';
import type { AppCoordinationTokenClaims } from '../app-coordination';
import {
  clearSupabaseAuthCookies,
  getAppSessionRefreshEarlySeconds,
  getAppSessionRefreshTokenFromRequest,
  getAppSessionTokenFromRequest,
  getWebAppSessionRefreshTokenFromRequest,
  getWebAppSessionTokenFromRequest,
  verifyAppSessionRequestWithToken,
} from '../app-session';
import {
  copySetCookieHeaders,
  createNextResponseWithRequestHeaders,
  getSetCookieHeaders,
  updateCookieHeaderFromSetCookies,
} from './response-cookies';

export type AppSessionRefreshState =
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
      response?: Response;
    };

type VerifiedAccess = Extract<
  ReturnType<typeof verifyAppSessionRequestWithToken>,
  { ok: true }
>;
type AllowedAssurance = Extract<
  Awaited<ReturnType<typeof resolveRequiredMfaAppSessionAuthority>>,
  { status: 'allowed' }
>;

function authorityDeadline(
  access: VerifiedAccess,
  assurance: AllowedAssurance
) {
  return assurance.required
    ? Math.min(
        access.claims.exp,
        assurance.proof.expiresAt ?? access.claims.exp
      )
    : access.claims.exp;
}

export async function resolveSignedAppSessionForRequest(
  req: NextRequest,
  options: {
    now?: Date;
    requireWebAppSession?: boolean;
    targetApp: AppName | string;
  },
  refreshUrl: () => URL
): Promise<AppSessionRefreshState> {
  const currentTime = () => options.now ?? new Date();
  const currentSeconds = () => Math.floor(currentTime().getTime() / 1000);
  const verification = verifyAppSessionRequestWithToken(req, {
    now: currentTime(),
    targetApp: options.targetApp,
  });
  const acceptVerifiedAccess = (
    access: VerifiedAccess,
    deadline: number
  ): AppSessionRefreshState => {
    const nowSeconds = currentSeconds();
    if (deadline <= nowSeconds)
      return {
        ok: false,
        error:
          access.claims.exp <= nowSeconds ? 'Token expired' : 'MFA required',
      };
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('authorization', `Bearer ${access.token}`);
    req.headers.set('authorization', `Bearer ${access.token}`);
    return {
      claims: access.claims,
      ok: true,
      refreshed: false,
      requestHeaders,
      response: clearSupabaseAuthCookies(
        req,
        createNextResponseWithRequestHeaders(requestHeaders)
      ),
    };
  };
  const webAccessToken = getWebAppSessionTokenFromRequest(req);
  const accessToken = verification.ok
    ? verification.token
    : (webAccessToken ?? getAppSessionTokenFromRequest(req));
  const refreshToken =
    getWebAppSessionRefreshTokenFromRequest(req) ??
    getAppSessionRefreshTokenFromRequest(req);
  const shouldRefreshMissingWebSession =
    options.requireWebAppSession && !webAccessToken && Boolean(refreshToken);
  let deadline = 0;
  if (verification.ok) {
    const assurance = await resolveRequiredMfaAppSessionAuthority(
      verification.claims,
      options
    );
    if (assurance.status !== 'allowed')
      return { error: 'MFA required', ok: false };
    deadline = authorityDeadline(verification, assurance);
    const earlySeconds = getAppSessionRefreshEarlySeconds(verification.claims);
    const secondsUntilExpiry = verification.claims.exp - currentSeconds();
    if (
      !refreshToken ||
      (secondsUntilExpiry > earlySeconds && !shouldRefreshMissingWebSession)
    ) {
      return acceptVerifiedAccess(verification, deadline);
    }
  } else if (!refreshToken) return verification;

  const refreshResponse = await fetch(refreshUrl(), {
    body: JSON.stringify({ accessToken, refreshToken }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    method: 'POST',
  }).catch(() => null);
  if (refreshResponse?.status === 403)
    return { error: 'MFA required', ok: false };
  if (!refreshResponse?.ok) {
    if (verification.ok && deadline > currentSeconds())
      return acceptVerifiedAccess(verification, deadline);
    return {
      error:
        refreshResponse?.status === 503
          ? 'App session refresh unavailable'
          : 'Invalid app session refresh credentials',
      ok: false,
    };
  }

  const setCookieHeaders = getSetCookieHeaders(refreshResponse.headers);
  const requestHeaders = new Headers(req.headers);
  const nextCookieHeader = updateCookieHeaderFromSetCookies(
    req.headers.get('cookie'),
    setCookieHeaders
  );
  if (nextCookieHeader) requestHeaders.set('cookie', nextCookieHeader);
  else requestHeaders.delete('cookie');
  // Rotation is verified from its returned cookies, not the previous bearer.
  requestHeaders.delete('authorization');
  const replacement = verifyAppSessionRequestWithToken(
    { headers: requestHeaders },
    {
      now: currentTime(),
      targetApp: options.targetApp,
    }
  );
  if (!replacement.ok) return replacement;
  const assurance = await resolveRequiredMfaAppSessionAuthority(
    replacement.claims,
    options
  );
  if (assurance.status !== 'allowed')
    return { error: 'MFA required', ok: false, response: refreshResponse };
  const finalNowSeconds = currentSeconds();
  if (authorityDeadline(replacement, assurance) <= finalNowSeconds)
    return {
      error:
        replacement.claims.exp <= finalNowSeconds
          ? 'Token expired'
          : 'MFA required',
      ok: false,
    };

  requestHeaders.set('authorization', `Bearer ${replacement.token}`);
  req.headers.set('authorization', `Bearer ${replacement.token}`);
  const response = clearSupabaseAuthCookies(
    req,
    createNextResponseWithRequestHeaders(requestHeaders)
  );
  copySetCookieHeaders(setCookieHeaders, response);
  return {
    claims: replacement.claims,
    ok: true,
    refreshed: true,
    requestHeaders,
    response,
  };
}
