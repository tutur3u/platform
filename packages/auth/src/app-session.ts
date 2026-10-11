import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { NextResponse } from 'next/server';
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  type AppSessionRequest,
  getAppSessionClaimsFromRequest,
  SUPABASE_AUTH_COOKIE_PATTERN,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
} from './app-session-core';
import {
  createAppSessionUser,
  getSupabaseAuthClaimsForUser,
} from './app-session-user';

export * from './app-session-core';
export { createAppSessionUser } from './app-session-user';

type RequestLike = AppSessionRequest;
type AppSessionOptions = Parameters<typeof getAppSessionClaimsFromRequest>[1];

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
