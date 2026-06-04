import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { NextResponse } from 'next/server';
import {
  type AppCoordinationTokenClaims,
  createAppCoordinationToken,
  getBearerAppCoordinationToken,
  isAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination';
import {
  DEFAULT_APP_COORDINATION_SESSION_POLICY,
  type ResolvedInternalAppSessionPolicy,
} from './app-session-policy';

export const APP_SESSION_COOKIE_NAME = 'tuturuuu_app_session';
export const WEB_APP_SESSION_COOKIE_NAME = 'tuturuuu_web_app_session';
export const APP_SESSION_REFRESH_COOKIE_NAME = 'tuturuuu_app_session_refresh';
export const WEB_APP_SESSION_REFRESH_COOKIE_NAME =
  'tuturuuu_web_app_session_refresh';
export const APP_SESSION_SCOPE = 'internal-app:session';
export const APP_SESSION_REFRESH_SCOPE = 'internal-app:refresh';
export const APP_SESSION_REFRESH_EARLY_SCOPE_PREFIX =
  'internal-app:refresh-early:';
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

export type AppSessionTokenPair = {
  access: {
    claims: AppCoordinationTokenClaims;
    expiresAt: string;
    token: string;
  };
  refresh: {
    claims: AppCoordinationTokenClaims;
    expiresAt: string;
    token: string;
  };
  refreshEarlySeconds: number;
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
  url?: string;
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

export function createAppSessionRefreshToken(
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
      scopes: normalizeAppSessionRefreshScopes(payload.scopes),
      targetApp: payload.targetApp,
      userId: payload.userId,
    },
    options
  );
}

export function createAppSessionTokenPair(
  payload: Omit<AppSessionTokenPayload, 'expiresInSeconds'>,
  options: {
    now?: Date;
    policy?: Partial<ResolvedInternalAppSessionPolicy>;
    secret?: string;
  } = {}
): AppSessionTokenPair {
  const policy = {
    internalAppAccessTtlSeconds:
      options.policy?.internalAppAccessTtlSeconds ??
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppAccessTtlSeconds,
    internalAppRefreshEarlySeconds:
      options.policy?.internalAppRefreshEarlySeconds ??
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshEarlySeconds,
    internalAppRefreshTtlSeconds:
      options.policy?.internalAppRefreshTtlSeconds ??
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshTtlSeconds,
  };
  const access = createAppSessionToken(
    {
      ...payload,
      expiresInSeconds: policy.internalAppAccessTtlSeconds,
      scopes: [
        ...(payload.scopes ?? []),
        `${APP_SESSION_REFRESH_EARLY_SCOPE_PREFIX}${policy.internalAppRefreshEarlySeconds}`,
      ],
    },
    options
  );
  const refresh = createAppSessionRefreshToken(
    {
      ...payload,
      expiresInSeconds: policy.internalAppRefreshTtlSeconds,
      scopes: undefined,
    },
    options
  );

  return {
    access,
    refresh,
    refreshEarlySeconds: policy.internalAppRefreshEarlySeconds,
  };
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

export function verifyAppSessionRefreshToken(
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

  if (!verification.claims.scopes.includes(APP_SESSION_REFRESH_SCOPE)) {
    return {
      error: 'App session refresh token missing required scope',
      ok: false,
    };
  }

  if (verification.claims.scopes.includes(APP_SESSION_SCOPE)) {
    return {
      error: 'App session refresh token must not be an access token',
      ok: false,
    };
  }

  return verification;
}

export function getAppSessionRefreshEarlySeconds(
  claims: AppCoordinationTokenClaims,
  fallbackSeconds = DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshEarlySeconds
) {
  const scope = claims.scopes.find((entry) =>
    entry.startsWith(APP_SESSION_REFRESH_EARLY_SCOPE_PREFIX)
  );
  const parsed = Number.parseInt(
    scope?.slice(APP_SESSION_REFRESH_EARLY_SCOPE_PREFIX.length) ?? '',
    10
  );

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackSeconds;
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

function normalizeAppSessionRefreshScopes(scopes: string[] = []) {
  return [
    APP_SESSION_REFRESH_SCOPE,
    ...scopes.filter(
      (scope) =>
        scope !== APP_SESSION_REFRESH_SCOPE && scope !== APP_SESSION_SCOPE
    ),
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
  return getAppSessionTokenCandidatesFromRequest(request)[0] ?? null;
}

export function getWebAppSessionTokenFromRequest(request: RequestLike) {
  const webCookieToken = getCookieValue(request, WEB_APP_SESSION_COOKIE_NAME);

  return webCookieToken && isAppCoordinationToken(webCookieToken)
    ? webCookieToken
    : null;
}

export function getAppSessionRefreshTokenFromRequest(request: RequestLike) {
  const refreshToken = getCookieValue(request, APP_SESSION_REFRESH_COOKIE_NAME);

  return refreshToken && isAppCoordinationToken(refreshToken)
    ? refreshToken
    : null;
}

export function getWebAppSessionRefreshTokenFromRequest(request: RequestLike) {
  const refreshToken = getCookieValue(
    request,
    WEB_APP_SESSION_REFRESH_COOKIE_NAME
  );

  return refreshToken && isAppCoordinationToken(refreshToken)
    ? refreshToken
    : null;
}

export function hasWebAppSessionTokenFromRequest(request: RequestLike) {
  return Boolean(getWebAppSessionTokenFromRequest(request));
}

function getAppSessionTokenCandidatesFromRequest(request: RequestLike) {
  const tokens = new Set<string>();
  const bearerToken = getBearerAppCoordinationToken(request);

  if (bearerToken) {
    tokens.add(bearerToken);
  }

  const cookieToken = getCookieValue(request, APP_SESSION_COOKIE_NAME);
  const webCookieToken = getCookieValue(request, WEB_APP_SESSION_COOKIE_NAME);

  if (webCookieToken && isAppCoordinationToken(webCookieToken)) {
    tokens.add(webCookieToken);
  }

  if (cookieToken && isAppCoordinationToken(cookieToken)) {
    tokens.add(cookieToken);
  }

  return [...tokens];
}

export function verifyAppSessionRequest(
  request: RequestLike,
  options: AppSessionOptions = {}
): AppSessionVerification {
  const tokens = getAppSessionTokenCandidatesFromRequest(request);

  if (tokens.length === 0) {
    return {
      error: 'Missing app session',
      ok: false,
    };
  }

  let lastVerification: AppSessionVerification | null = null;

  for (const token of tokens) {
    const verification = verifyAppSessionToken(token, options);

    if (verification.ok) {
      return verification;
    }

    lastVerification = verification;
  }

  return (
    lastVerification ?? {
      error: 'Missing app session',
      ok: false,
    }
  );
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

export function setWebAppSessionCookie(
  response: NextResponse,
  token: string,
  options: {
    expires?: Date;
  } = {}
) {
  response.cookies.set(
    WEB_APP_SESSION_COOKIE_NAME,
    token,
    getAppSessionCookieOptions(options)
  );
}

export function setAppSessionRefreshCookie(
  response: NextResponse,
  token: string,
  options: {
    expires?: Date;
  } = {}
) {
  response.cookies.set(
    APP_SESSION_REFRESH_COOKIE_NAME,
    token,
    getAppSessionCookieOptions(options)
  );
}

export function setWebAppSessionRefreshCookie(
  response: NextResponse,
  token: string,
  options: {
    expires?: Date;
  } = {}
) {
  response.cookies.set(
    WEB_APP_SESSION_REFRESH_COOKIE_NAME,
    token,
    getAppSessionCookieOptions(options)
  );
}

export function clearAppSessionCookie(response: NextResponse) {
  response.cookies.set(APP_SESSION_COOKIE_NAME, '', {
    ...getAppSessionCookieOptions({ expires: new Date(0) }),
    maxAge: 0,
  });
  response.cookies.set(WEB_APP_SESSION_COOKIE_NAME, '', {
    ...getAppSessionCookieOptions({ expires: new Date(0) }),
    maxAge: 0,
  });
  response.cookies.set(APP_SESSION_REFRESH_COOKIE_NAME, '', {
    ...getAppSessionCookieOptions({ expires: new Date(0) }),
    maxAge: 0,
  });
  response.cookies.set(WEB_APP_SESSION_REFRESH_COOKIE_NAME, '', {
    ...getAppSessionCookieOptions({ expires: new Date(0) }),
    maxAge: 0,
  });
}

export function clearAppSessionAndReturn(response: NextResponse) {
  clearAppSessionCookie(response);
  return response;
}

function wantsJsonLogoutResponse(request: RequestLike) {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

export function createAppSessionLogoutResponse(
  request: RequestLike,
  options: {
    redirectUrl: string | URL;
  }
) {
  const response = wantsJsonLogoutResponse(request)
    ? NextResponse.json({ success: true })
    : NextResponse.redirect(options.redirectUrl, { status: 303 });

  return clearSupabaseAuthCookies(request, clearAppSessionAndReturn(response));
}

export function isSupabaseAuthCookieName(name: string) {
  return SUPABASE_AUTH_COOKIE_PATTERN.test(name);
}

function getHostnameFromHostHeader(value: string | null) {
  if (!value) {
    return null;
  }

  const [firstValue] = value.split(',').map((entry) => entry.trim());

  if (!firstValue) {
    return null;
  }

  try {
    return new URL(`http://${firstValue}`).hostname;
  } catch {
    return null;
  }
}

function getRequestHostnames(request: RequestLike) {
  const hostnames = new Set<string>();

  if (request.url) {
    try {
      hostnames.add(new URL(request.url).hostname);
    } catch {
      // Ignore malformed request URLs.
    }
  }

  for (const headerName of ['host', 'x-forwarded-host']) {
    const hostname = getHostnameFromHostHeader(request.headers.get(headerName));
    if (hostname) {
      hostnames.add(hostname);
    }
  }

  return [...hostnames];
}

function isSharedSupabaseCookieHostname(hostname: string) {
  return (
    hostname === 'tuturuuu.com' ||
    hostname.endsWith('.tuturuuu.com') ||
    hostname === 'tuturuuu.localhost' ||
    hostname.endsWith('.tuturuuu.localhost')
  );
}

function getConfiguredSupabaseAuthStorageKeys() {
  return [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVER_URL,
    process.env.SUPABASE_URL,
  ]
    .flatMap((url) => {
      if (!url) {
        return [];
      }

      try {
        return [getSupabaseAuthStorageKey(url)];
      } catch {
        return [];
      }
    })
    .filter((value, index, values) => values.indexOf(value) === index);
}

function getSupabaseAuthStorageKey(url: string) {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

function isSupabaseAuthCookieChunkForStorageKey(
  cookieName: string,
  storageKey: string
) {
  if (cookieName === storageKey) {
    return true;
  }

  if (!cookieName.startsWith(`${storageKey}.`)) {
    return false;
  }

  return /^\d+$/u.test(cookieName.slice(storageKey.length + 1));
}

function shouldPreserveSupabaseAuthCookie(
  request: RequestLike,
  cookieName: string
) {
  if (!getRequestHostnames(request).some(isSharedSupabaseCookieHostname)) {
    return false;
  }

  return getConfiguredSupabaseAuthStorageKeys().some((storageKey) =>
    isSupabaseAuthCookieChunkForStorageKey(cookieName, storageKey)
  );
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
    if (
      !isSupabaseAuthCookieName(name) ||
      shouldPreserveSupabaseAuthCookie(request, name)
    ) {
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

export function hasSupportedSupabaseAuthCookie(request: RequestLike) {
  return getRequestCookieNames(request).some(
    (name) =>
      isSupabaseAuthCookieName(name) &&
      shouldPreserveSupabaseAuthCookie(request, name)
  );
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

export async function getSupabaseSessionUser(): Promise<SupabaseUser | null> {
  try {
    const { createClient } = await import('@tuturuuu/supabase/next/server');
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user;
  } catch {
    return null;
  }
}

function getSupabaseAuthClaimsForUser(user: SupabaseUser) {
  const sessionUser = user as SupabaseUser & {
    app_metadata?: Record<string, unknown>;
    aud?: string | null;
    role?: string | null;
    user_metadata?: Record<string, unknown>;
  };

  return {
    app_metadata: sessionUser.app_metadata ?? {},
    aud: sessionUser.aud ?? 'authenticated',
    email: user.email ?? null,
    role: sessionUser.role ?? 'authenticated',
    sub: user.id,
    user_metadata: sessionUser.user_metadata ?? {},
  };
}

export function attachSupabaseAuthUser<T extends TypedSupabaseClient>(
  supabase: T,
  user: SupabaseUser
): T {
  const existingAuth =
    'auth' in supabase && supabase.auth
      ? (supabase.auth as unknown as Record<string, unknown>)
      : {};
  const auth = {
    ...existingAuth,
    getClaims: async () => ({
      data: { claims: getSupabaseAuthClaimsForUser(user) },
      error: null,
    }),
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user }, error: null }),
  };

  Object.defineProperty(supabase, 'auth', {
    configurable: true,
    enumerable: true,
    value: auth,
    writable: true,
  });

  return supabase;
}
