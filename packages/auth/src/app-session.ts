import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getTuturuuuSharedCookieDomains,
  resolveTrustedForwardedHostname,
} from '@tuturuuu/utils/shared-cookie';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import {
  APP_SESSION_COOKIE_NAME,
  APP_LOGOUT_COOKIE_NAME,
  hasAppLogoutFence,
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
  clearAppLogoutFence(response);
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
  clearAppLogoutFence(response);
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

function clearAppLogoutFence(response: NextResponse) {
  response.cookies.set(APP_LOGOUT_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
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

export function createAppOnlyLogoutHandlers({
  centralOrigin: centralUrl,
  confirmationOnGet = false,
  getAppOrigin = (request: NextRequest) => new URL(request.url).origin,
}: {
  centralOrigin: string;
  confirmationOnGet?: boolean;
  getAppOrigin?: (request: NextRequest) => string;
}) {
  const centralOrigin = new URL(centralUrl).origin;
  const GET = (request?: NextRequest) => {
    if (confirmationOnGet && request?.method === 'GET') {
      const locale = request.cookies.get('NEXT_LOCALE')?.value;
      const destination = new URL(
        locale === 'vi' ? '/vi/logout' : '/logout',
        centralOrigin
      );
      destination.searchParams.set('appUrl', getAppOrigin(request));
      return NextResponse.redirect(destination, { status: 303 });
    }
    return new NextResponse(null, {
      status: 405,
      headers: { Allow: 'POST, OPTIONS' },
    });
  };

  const acceptedOrigin = (request: NextRequest) => {
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    const ownOrigin = getAppOrigin(request);
    if (origin === ownOrigin)
      return site === null || site === 'same-origin' ? origin : null;
    // Only the configured central confirmation page may end this app's session.
    return origin === centralOrigin && (site === null || site === 'same-site')
      ? origin
      : null;
  };

  const withCors = (origin: string, response: NextResponse) => {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.append('Vary', 'Origin');
    return response;
  };

  const OPTIONS = (request: NextRequest) => {
    const origin = acceptedOrigin(request);
    if (!origin) return new NextResponse(null, { status: 403 });
    const response = withCors(origin, new NextResponse(null, { status: 204 }));
    response.headers.set('Access-Control-Allow-Methods', 'POST');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Accept, Content-Type'
    );
    return response;
  };

  const POST = (request: NextRequest) => {
    if (request.method !== 'POST') return GET();
    const origin = acceptedOrigin(request);
    if (!origin) return new NextResponse(null, { status: 403 });
    const appOrigin = new URL(getAppOrigin(request));
    if (
      appOrigin.protocol !== 'https:' ||
      appOrigin.hostname === new URL(centralOrigin).hostname
    ) {
      return withCors(
        origin,
        NextResponse.json(
          { success: false, error: 'app_scope_unavailable' },
          { status: 409 }
        )
      );
    }
    const result = wantsJsonLogoutResponse(request)
      ? NextResponse.json({ success: true })
      : NextResponse.redirect(new URL('/login', request.url), { status: 303 });
    if (result.headers.has('location'))
      result.headers.set('location', '/login');
    const response = clearSupabaseAuthCookies(
      request,
      clearAppSessionAndReturn(result)
    );
    response.cookies.set(APP_LOGOUT_COOKIE_NAME, '1', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });
    return withCors(origin, response);
  };

  return { GET, OPTIONS, POST };
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

  const hostHeaderHostname = getHostnameFromHostHeader(
    request.headers.get('host')
  );
  if (hostHeaderHostname) {
    hostnames.add(hostHeaderHostname);
  }

  // A client-supplied X-Forwarded-Host must not decide whether shared Supabase
  // cookies are kept: honour it only for a configured origin or with a
  // verified gateway origin proof.
  const forwardedHostname = resolveTrustedForwardedHostname(
    request.headers.get('x-forwarded-host'),
    request.headers
  );
  if (forwardedHostname) {
    hostnames.add(forwardedHostname);
  }

  return [...hostnames];
}

function isSharedSupabaseCookieHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return getTuturuuuSharedCookieDomains().some(
    (entry) =>
      normalizedHostname === entry.hostname ||
      normalizedHostname.endsWith(`.${entry.hostname}`)
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
  const localSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let localE2E = false;
  if (process.env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS === '1' && localSupabaseUrl) {
    try {
      const url = new URL(localSupabaseUrl);
      localE2E =
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname);
    } catch {
      localE2E = false;
    }
  }
  if (
    !getRequestHostnames(request).some(
      (hostname) =>
        isSharedSupabaseCookieHostname(hostname) ||
        (localE2E && ['localhost', '127.0.0.1'].includes(hostname))
    )
  ) {
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
  if (hasAppLogoutFence(request)) return false;
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
