import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import type { NextResponse } from 'next/server';
import {
  type AppCoordinationTokenClaims,
  createAppCoordinationToken,
  getBearerAppCoordinationToken,
  isAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination';

export const APP_SESSION_COOKIE_NAME = 'tuturuuu_app_session';
export const APP_SESSION_SCOPE = 'internal-app:session';
export const SUPABASE_AUTH_COOKIE_PATTERN =
  /^sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?$/u;

export type AppSessionTargetApp = AppName | string;

export type AppSessionTokenPayload = {
  email?: string | null;
  expiresInSeconds?: number;
  originApp?: AppSessionTargetApp;
  scopes?: string[];
  targetApp: AppSessionTargetApp;
  userId: string;
};

export type AppSessionVerification =
  | {
      claims: AppCoordinationTokenClaims;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

type AppSessionOptions = {
  now?: Date;
  requiredScope?: string | false;
  secret?: string;
  targetApp?: AppSessionTargetApp | readonly AppSessionTargetApp[];
};

type RequestLike = Pick<Request, 'headers'> & {
  cookies?: {
    getAll?: () => Array<{ name: string }>;
    get?: (name: string) => { value?: string } | string | undefined;
  };
};

export function createAppSessionToken(
  payload: AppSessionTokenPayload,
  options: {
    now?: Date;
    secret?: string;
  } = {}
) {
  return createAppCoordinationToken(
    {
      email: payload.email ?? null,
      expiresInSeconds: payload.expiresInSeconds,
      originApp: payload.originApp ?? 'web',
      scopes: normalizeAppSessionScopes(payload.scopes),
      targetApp: payload.targetApp,
      userId: payload.userId,
    },
    options
  );
}

export function verifyAppSessionToken(
  token: string,
  options: AppSessionOptions = {}
): AppSessionVerification {
  const verification = verifyAppCoordinationToken(token, options);

  if (!verification.ok) {
    return verification;
  }

  if (
    !matchesAppSessionTarget(verification.claims.target_app, options.targetApp)
  ) {
    return {
      error: 'App session target mismatch',
      ok: false,
    };
  }

  const requiredScope = options.requiredScope ?? APP_SESSION_SCOPE;

  if (requiredScope && !verification.claims.scopes.includes(requiredScope)) {
    return {
      error: 'App session missing required scope',
      ok: false,
    };
  }

  return verification;
}

function matchesAppSessionTarget(
  actualTargetApp: string,
  expectedTargetApp?: AppSessionTargetApp | readonly AppSessionTargetApp[]
) {
  if (!expectedTargetApp) return true;

  const expectedTargetApps = Array.isArray(expectedTargetApp)
    ? expectedTargetApp
    : [expectedTargetApp];

  return expectedTargetApps.includes(actualTargetApp);
}

function normalizeAppSessionScopes(scopes: string[] = []) {
  return [
    APP_SESSION_SCOPE,
    ...scopes.filter((scope) => scope !== APP_SESSION_SCOPE),
  ];
}

function getCookieValue(request: RequestLike, name: string) {
  const cookieValue = request.cookies?.get?.(name);

  if (typeof cookieValue === 'string') {
    return cookieValue;
  }

  if (cookieValue?.value) {
    return cookieValue.value;
  }

  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join('='));
    }
  }

  return null;
}

export function getAppSessionTokenFromRequest(request: RequestLike) {
  const bearerToken = getBearerAppCoordinationToken(request);

  if (bearerToken) {
    return bearerToken;
  }

  const cookieToken = getCookieValue(request, APP_SESSION_COOKIE_NAME);

  return isAppCoordinationToken(cookieToken) ? cookieToken : null;
}

export function verifyAppSessionRequest(
  request: RequestLike,
  options: AppSessionOptions = {}
): AppSessionVerification {
  const token = getAppSessionTokenFromRequest(request);

  if (!token) {
    return {
      error: 'Missing app session',
      ok: false,
    };
  }

  return verifyAppSessionToken(token, options);
}

export function getAppSessionClaimsFromRequest(
  request: RequestLike,
  options: AppSessionOptions = {}
) {
  const verification = verifyAppSessionRequest(request, options);

  return verification.ok ? verification.claims : null;
}

export function getAppSessionUserFromRequest(
  request: RequestLike,
  options: AppSessionOptions = {}
): SupabaseUser | null {
  const claims = getAppSessionClaimsFromRequest(request, options);

  return claims ? createAppSessionUser(claims) : null;
}

export function getAppSessionCookieOptions(
  options: { expires?: Date } = {}
): Partial<ResponseCookie> {
  return {
    expires: options.expires,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

export function setAppSessionCookie(
  response: NextResponse,
  token: string,
  options: {
    expires?: Date;
  } = {}
) {
  response.cookies.set(
    APP_SESSION_COOKIE_NAME,
    token,
    getAppSessionCookieOptions(options)
  );
}

export function clearAppSessionCookie(response: NextResponse) {
  response.cookies.set(APP_SESSION_COOKIE_NAME, '', {
    ...getAppSessionCookieOptions({ expires: new Date(0) }),
    maxAge: 0,
  });
}

export function clearAppSessionAndReturn(response: NextResponse) {
  clearAppSessionCookie(response);
  return response;
}

export function isSupabaseAuthCookieName(name: string) {
  return SUPABASE_AUTH_COOKIE_PATTERN.test(name);
}

function getRequestCookieNames(request: RequestLike) {
  const names = new Set<string>();

  for (const cookie of request.cookies?.getAll?.() ?? []) {
    names.add(cookie.name);
  }

  const cookieHeader = request.headers.get('cookie');

  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [rawName] = part.trim().split('=');
      if (rawName) names.add(rawName);
    }
  }

  return [...names];
}

export function clearSupabaseAuthCookies(
  request: RequestLike,
  response: NextResponse
) {
  for (const name of getRequestCookieNames(request)) {
    if (!isSupabaseAuthCookieName(name)) {
      continue;
    }

    response.cookies.set(name, '', {
      expires: new Date(0),
      maxAge: 0,
      path: '/',
    });
  }

  return response;
}

export function createAppSessionUser(
  claims: AppCoordinationTokenClaims
): SupabaseUser {
  const timestamp = new Date(claims.iat * 1000).toISOString();

  return {
    app_metadata: {},
    aud: 'authenticated',
    confirmed_at: timestamp,
    created_at: timestamp,
    email: claims.email ?? undefined,
    id: claims.sub,
    identities: [],
    role: 'authenticated',
    updated_at: timestamp,
    user_metadata: {
      origin_app: claims.origin_app,
      target_app: claims.target_app,
    },
  } as SupabaseUser;
}
