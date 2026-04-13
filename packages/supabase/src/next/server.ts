import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import type { RequestCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { cookies } from 'next/headers';
import { sanitizeSupabaseAuthCookies } from './auth-cookie-sanitizer';
import { checkEnvVariables, type SupabaseCookie } from './common';
import {
  wrapDirectClientForProxyOnlyTables,
  wrapRequestClientForProxyOnlyTables,
} from './protected-tables';

function createCookieHandler(
  cookieStore: ReadonlyRequestCookies,
  url: string
): {
  getAll(): RequestCookie[];
  setAll(cookiesToSet: SupabaseCookie[]): void;
} {
  return {
    getAll() {
      return sanitizeSupabaseAuthCookies(cookieStore.getAll(), url, (name) => {
        try {
          cookieStore.set(name, '', {
            expires: new Date(0),
            maxAge: 0,
            path: '/',
          });
        } catch {
          // Ignore cookie clearing failures in read-only contexts.
        }
      });
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

async function createGenericClient<T = Database>(
  isAdmin: boolean
): Promise<SupabaseClient<T>> {
  const { url, key } = checkEnvVariables({ useSecretKey: isAdmin });
  const cookieStore = await cookies();
  return createServerClient<T>(url, key, {
    cookies: isAdmin
      ? {
          getAll() {
            return [] as SupabaseCookie[];
          },

          setAll(_: SupabaseCookie[]) {},
        }
      : createCookieHandler(cookieStore, url),
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
  request?: Pick<Request, 'headers'>
): Promise<SupabaseClient<T>> {
  // Check for Bearer token in request headers (mobile / API callers).
  if (request) {
    const authHeader =
      request.headers.get('authorization') ??
      request.headers.get('Authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '').trim()
      : undefined;

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

    const userClient = await createGenericClient<T>(false);

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
  request?: Pick<Request, 'headers'>
): Promise<SupabaseClient<T>> {
  // Check for Bearer token in request headers (mobile / API callers).
  if (request) {
    const authHeader =
      request.headers.get('authorization') ??
      request.headers.get('Authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '').trim()
      : undefined;

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

    const userClient = await createGenericClient<T>(false);

    return wrapRequestClientForProxyOnlyTables(
      userClient,
      createRequestAdminProxyClient<T>()
    );
  }

  // Fall back to cookie-based auth (web browser flow).
  const { url, key } = checkEnvVariables({ useSecretKey: false });
  const cookieStore = await cookies();
  return wrapDirectClientForProxyOnlyTables(
    createServerClient<T>(url, key, {
      cookies: createCookieHandler(cookieStore, url),
    })
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
    cookies: {
      getAll() {
        return [] as SupabaseCookie[];
      },

      setAll(_: SupabaseCookie[]) {},
    },
  });
}
