import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import type { RequestCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { cookies, headers } from 'next/headers';
import { sanitizeSupabaseAuthCookies } from './auth-cookie-sanitizer';
import {
  checkEnvVariables,
  getSupabaseAuthCookieUrls,
  getSupabaseCookieOptions,
  type SupabaseCookie,
} from './common';
import {
  wrapDirectClientForProxyOnlyTables,
  wrapRequestClientForProxyOnlyTables,
} from './protected-tables';

const APP_SESSION_COOKIE_NAME = 'tuturuuu_app_session';
const APP_SESSION_BEARER_PREFIX = 'ttr_app_';
const SUPABASE_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

function createCookieHandler(
  cookieStore: ReadonlyRequestCookies,
  url: string,
  cookieOptions: ReturnType<typeof getSupabaseCookieOptions>
): {
  getAll(): RequestCookie[];
  setAll(cookiesToSet: SupabaseCookie[]): void;
} {
  const authCookieUrls = getSupabaseAuthCookieUrls(url);
  const mirrorCookieOptions = {
    domain: cookieOptions.domain,
    path: cookieOptions.path,
    sameSite: cookieOptions.sameSite,
    secure: cookieOptions.secure,
  };

  return {
    getAll() {
      return sanitizeSupabaseAuthCookies(
        cookieStore.getAll(),
        authCookieUrls,
        (name, options) => {
          try {
            cookieStore.set(name, '', options);
          } catch {
            // Ignore cookie clearing failures in read-only contexts.
          }
        },
        (name, value) => {
          try {
            cookieStore.set(name, value, {
              ...mirrorCookieOptions,
              maxAge: SUPABASE_SESSION_COOKIE_MAX_AGE_SECONDS,
            });
          } catch {
            // Ignore cookie mirroring failures in read-only contexts.
          }
        }
      );
    },
    setAll(cookiesToSet: SupabaseCookie[]) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // The `setAll` method was called from a Server Component.
        // This can be ignored if you have middleware refreshing
        // user sessions.
      }
    },
  };
}

function extractForwardedHeaderValue(value: string | null) {
  return (
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .find(Boolean) ?? null
  );
}

function resolveRequestUrlFromHeaders(
  headerStore: Pick<Headers, 'get'>
): string | null {
  const forwardedHost = extractForwardedHeaderValue(
    headerStore.get('x-forwarded-host')
  );
  const host =
    forwardedHost ?? extractForwardedHeaderValue(headerStore.get('host'));

  if (!host || /[\r\n]/u.test(host)) {
    return null;
  }

  const forwardedProto =
    extractForwardedHeaderValue(headerStore.get('x-forwarded-proto')) ??
    'https';
  const protocol = forwardedProto.replace(/:$/u, '').toLowerCase();

  return `${protocol === 'http' ? 'http' : 'https'}://${host}`;
}

async function getRequestUrlFromHeaders() {
  try {
    return resolveRequestUrlFromHeaders(await headers());
  } catch {
    return null;
  }
}

function resolveRequestUrlFromRequest(
  request: Pick<Request, 'headers'> & Partial<Pick<Request, 'url'>>
) {
  return resolveRequestUrlFromHeaders(request.headers) ?? request.url ?? null;
}

async function createGenericClient<T = Database>(
  isAdmin: boolean,
  requestUrl?: string | URL | null
): Promise<SupabaseClient<T>> {
  const { url, key } = checkEnvVariables({ useSecretKey: isAdmin });
  const cookieStore = await cookies();
  const resolvedRequestUrl = requestUrl ?? (await getRequestUrlFromHeaders());
  const cookieOptions = getSupabaseCookieOptions(url, resolvedRequestUrl);
  return createServerClient<T>(url, key, {
    cookieOptions,
    cookies: isAdmin
      ? {
          getAll() {
            return [] as SupabaseCookie[];
          },

          setAll(_: SupabaseCookie[]) {},
        }
      : createCookieHandler(cookieStore, url, cookieOptions),
  });
}

function createRequestAdminProxyClient<T = Database>(): SupabaseClient<T> {
  const { url, key } = checkEnvVariables({ useSecretKey: true });

  return createBrowserClient<T>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function createNoCookieAnonProxyClient<T = Database>(): SupabaseClient<T> {
  const { url, key } = checkEnvVariables({ useSecretKey: false });

  return createBrowserClient<T>(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function hasCookieNamed(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return false;
  }

  return cookieHeader.split(';').some((part) => {
    const [rawName] = part.trim().split('=');
    return rawName === name;
  });
}

function getBearerAccessToken(request: Pick<Request, 'headers'>) {
  const authHeader =
    request.headers.get('authorization') ??
    request.headers.get('Authorization');

  return authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : undefined;
}

function requestHasAppSessionAuth(request: Pick<Request, 'headers'>) {
  const accessToken = getBearerAccessToken(request);

  return (
    Boolean(accessToken?.startsWith(APP_SESSION_BEARER_PREFIX)) ||
    hasCookieNamed(request.headers.get('cookie'), APP_SESSION_COOKIE_NAME)
  );
}

function createAppSessionIsolatedRequestClient<T = Database>() {
  return wrapRequestClientForProxyOnlyTables(
    createNoCookieAnonProxyClient<T>(),
    createRequestAdminProxyClient<T>()
  );
}

export function createAdminClient<T = Database>({
  noCookie = false,
}: {
  noCookie?: boolean;
} = {}): SupabaseClient<T> | Promise<SupabaseClient<T>> {
  if (noCookie) {
    const { url, key } = checkEnvVariables({ useSecretKey: true });
    return createBrowserClient<T>(url, key);
  }

  return createGenericClient<T>(true);
}

export function createAnonClient<T = Database>():
  | SupabaseClient<T>
  | Promise<SupabaseClient<T>> {
  const { url, key } = checkEnvVariables({ useSecretKey: false });
  return createBrowserClient<T>(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    },
    // disable client-side session behaviors in server functions
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Create a Supabase client for server-side use.
 *
 * Without arguments, authenticates via cookies (standard web flow).
 * When a `request` is passed, the function first checks for a
 * `Bearer` token in the `Authorization` header and, if present,
 * creates a client using that token (mobile / API flow). This keeps
 * RLS intact because the user's JWT is forwarded to Supabase.
 */
export async function createClient<T = Database>(
  request?: Pick<Request, 'headers'> & Partial<Pick<Request, 'url'>>
): Promise<SupabaseClient<T>> {
  // Check for Bearer token in request headers (mobile / API callers).
  if (request) {
    if (requestHasAppSessionAuth(request)) {
      return createAppSessionIsolatedRequestClient<T>();
    }

    const accessToken = getBearerAccessToken(request);

    if (accessToken) {
      const { url, key } = checkEnvVariables({ useSecretKey: false });
      const userClient = createBrowserClient<T>(url, key, {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });

      return wrapRequestClientForProxyOnlyTables(
        userClient,
        createRequestAdminProxyClient<T>()
      );
    }

    const userClient = await createGenericClient<T>(
      false,
      resolveRequestUrlFromRequest(request)
    );

    return wrapRequestClientForProxyOnlyTables(
      userClient,
      createRequestAdminProxyClient<T>()
    );
  }

  // Fall back to cookie-based auth (web browser flow).
  return wrapDirectClientForProxyOnlyTables(
    await createGenericClient<T>(false)
  );
}

/**
 * Create a dynamic Supabase client for server-side use.
 *
 * Without arguments, authenticates via cookies (standard web flow).
 * When a `request` is passed, the function first checks for a
 * `Bearer` token in the `Authorization` header and, if present,
 * creates a client using that token (mobile / API flow). This keeps
 * RLS intact because the user's JWT is forwarded to Supabase.
 */
export async function createDynamicClient<T = Database>(
  request?: Pick<Request, 'headers'> & Partial<Pick<Request, 'url'>>
): Promise<SupabaseClient<T>> {
  // Check for Bearer token in request headers (mobile / API callers).
  if (request) {
    if (requestHasAppSessionAuth(request)) {
      return createAppSessionIsolatedRequestClient<T>();
    }

    const accessToken = getBearerAccessToken(request);

    if (accessToken) {
      const { url, key } = checkEnvVariables({ useSecretKey: false });
      const userClient = createBrowserClient<T>(url, key, {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });

      return wrapRequestClientForProxyOnlyTables(
        userClient,
        createRequestAdminProxyClient<T>()
      );
    }

    const userClient = await createGenericClient<T>(
      false,
      resolveRequestUrlFromRequest(request)
    );

    return wrapRequestClientForProxyOnlyTables(
      userClient,
      createRequestAdminProxyClient<T>()
    );
  }

  // Fall back to cookie-based auth (web browser flow).
  return wrapDirectClientForProxyOnlyTables(
    await createGenericClient<T>(false)
  );
}

/**
 * Create a Supabase client that does NOT read or write cookies.
 * Useful for server-side operations (e.g. verifyOtp in cross-app auth)
 * where you need session tokens returned in the response body
 * rather than set as cookies.
 */
export function createDetachedClient<T = Database>(): SupabaseClient<T> {
  const { url, key } = checkEnvVariables({ useSecretKey: false });
  return createServerClient<T>(url, key, {
    cookieOptions: getSupabaseCookieOptions(url),
    cookies: {
      getAll() {
        return [] as SupabaseCookie[];
      },
      setAll(_: SupabaseCookie[]) {},
    },
  });
}

export async function createDynamicAdminClient(): Promise<SupabaseClient<any>> {
  const { url, key } = checkEnvVariables({ useSecretKey: true });
  return createServerClient(url, key, {
    cookieOptions: getSupabaseCookieOptions(url),
    cookies: {
      getAll() {
        return [] as SupabaseCookie[];
      },

      setAll(_: SupabaseCookie[]) {},
    },
  });
}
