import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { sanitizeSupabaseAuthCookies } from '../next/auth-cookie-sanitizer';
import {
  checkEnvVariables,
  getSupabaseAuthCookieUrls,
  getSupabaseCookieOptions,
  type SupabaseCookie,
} from '../next/common';
import { wrapRequestClientForProxyOnlyTables } from '../next/protected-tables';

const APP_SESSION_COOKIE_NAME = 'tuturuuu_app_session';
const APP_SESSION_BEARER_PREFIX = 'ttr_app_';

type RequestLike = Pick<Request, 'headers'> & Partial<Pick<Request, 'url'>>;

function extractForwardedHeaderValue(value: string | null) {
  return (
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .find(Boolean) ?? null
  );
}

function resolveRequestUrlFromHeaders(headerStore: Pick<Headers, 'get'>) {
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

function resolveRequestUrlFromRequest(request: RequestLike) {
  return resolveRequestUrlFromHeaders(request.headers) ?? request.url ?? null;
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

function createAppSessionIsolatedRequestClient<T = Database>() {
  return wrapRequestClientForProxyOnlyTables(
    createNoCookieAnonProxyClient<T>(),
    createRequestAdminProxyClient<T>()
  );
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

function parseCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return [] as { name: string; value: string }[];
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .map((part) => {
      const separatorIndex = part.indexOf('=');

      if (separatorIndex <= 0) {
        return null;
      }

      return {
        name: part.slice(0, separatorIndex).trim(),
        value: part.slice(separatorIndex + 1),
      };
    })
    .filter((cookie): cookie is { name: string; value: string } =>
      Boolean(cookie?.name)
    );
}

function createRequestCookieHandler(
  request: RequestLike,
  url: string,
  cookieOptions: ReturnType<typeof getSupabaseCookieOptions>
): {
  getAll(): { name: string; value: string }[];
  setAll(cookiesToSet: SupabaseCookie[]): void;
} {
  const authCookieUrls = getSupabaseAuthCookieUrls(url);

  return {
    getAll() {
      return sanitizeSupabaseAuthCookies(
        parseCookieHeader(request.headers.get('cookie')),
        authCookieUrls
      );
    },
    setAll(_: SupabaseCookie[]) {
      // Framework-neutral request clients cannot mutate response cookies.
      // Runtime adapters should handle refresh cookie writes explicitly.
      void cookieOptions;
    },
  };
}

export async function createRequestClient<T = Database>(
  request: RequestLike
): Promise<SupabaseClient<T>> {
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

  const { url, key } = checkEnvVariables({ useSecretKey: false });
  const cookieOptions = getSupabaseCookieOptions(
    url,
    resolveRequestUrlFromRequest(request)
  );
  const userClient = createServerClient<T>(url, key, {
    cookieOptions,
    cookies: createRequestCookieHandler(request, url, cookieOptions),
  });

  return wrapRequestClientForProxyOnlyTables(
    userClient,
    createRequestAdminProxyClient<T>()
  );
}
