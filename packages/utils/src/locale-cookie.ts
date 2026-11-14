import {
  type CookieOptionsLike,
  getTuturuuuSharedCookieOptions,
} from './shared-cookie';

/**
 * Locale cookie scope for app proxies (SR-SATELLITE-LOCALE-SECURE).
 *
 * Every `NEXT_LOCALE` cookie an app proxy emits takes its `Domain` and
 * `Secure` attributes from the app's canonical origin, never from the raw
 * `Host` or an unproven `X-Forwarded-Host` header:
 *
 * - A cookie written with a `Domain` (the shared-cookie scope) is re-scoped
 *   with the shared-cookie helper for the canonical origin.
 * - A host-only cookie (next-intl's middleware writes one when the request has
 *   no `Accept-Language` or an invalid locale cookie) stays host-only.
 * - The cookie is `Secure` whenever the canonical origin is `https` or the
 *   shared-cookie domain requires it. With no canonical origin it is host-only
 *   and `Secure`.
 *
 * Name, value, `Path`, `Max-Age`/`Expires` and `SameSite` are unchanged.
 * Callers resolve the canonical origin: `@tuturuuu/auth/locale-cookie` does so
 * from the app's configured canonical origins for proxies with auth.
 */

export const DEFAULT_LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

type LocaleCookie = CookieOptionsLike & {
  name: string;
  value: string;
};

type ResponseWithCookies = {
  cookies: {
    get(name: string): LocaleCookie | undefined;
    set(cookie: LocaleCookie): unknown;
  };
};

function hasResponseCookies(value: unknown): value is ResponseWithCookies {
  if (typeof value !== 'object' || value === null) return false;
  const cookies = (value as { cookies?: unknown }).cookies;
  return (
    typeof cookies === 'object' &&
    cookies !== null &&
    typeof (cookies as { get?: unknown }).get === 'function' &&
    typeof (cookies as { set?: unknown }).set === 'function'
  );
}

function isSecureOrigin(origin: string) {
  return origin.startsWith('https:');
}

/**
 * Options for a locale cookie a proxy writes itself: the shared-cookie scope
 * of `cookieOrigin`, `Secure` on an `https` origin. With no origin the cookie
 * is host-only and `Secure`.
 */
export function getLocaleCookieOptions<TOptions extends CookieOptionsLike>(
  options: TOptions,
  cookieOrigin: string | null
): TOptions {
  if (!cookieOrigin) {
    const hostOnly: TOptions = { ...options, secure: true };
    delete hostOnly.domain;
    return hostOnly;
  }

  const scoped =
    getTuturuuuSharedCookieOptions(options, cookieOrigin) ?? options;
  return isSecureOrigin(cookieOrigin) ? { ...scoped, secure: true } : scoped;
}

/**
 * Re-derives `Domain` and `Secure` of the locale cookie on `response` from
 * `cookieOrigin`. Responses without a locale cookie are returned untouched.
 */
export function secureLocaleCookie<TResponse>(
  response: TResponse,
  cookieOrigin: string | null,
  cookieName = DEFAULT_LOCALE_COOKIE_NAME
): TResponse {
  if (!hasResponseCookies(response)) return response;

  const cookie = response.cookies.get(cookieName);
  if (!cookie) return response;

  const { domain, name: _name, secure: _secure, value, ...rest } = cookie;
  let scope: CookieOptionsLike = { secure: true };

  if (cookieOrigin) {
    const shared = domain
      ? (getTuturuuuSharedCookieOptions({}, cookieOrigin) ?? {})
      : {};
    scope = {
      ...(shared.domain ? { domain: shared.domain } : {}),
      secure: shared.secure === true || isSecureOrigin(cookieOrigin),
    };
  }

  response.cookies.set({ ...rest, ...scope, name: cookieName, value });
  return response;
}

/**
 * Wraps a proxy so every locale cookie it emits, from any writer, is scoped
 * by {@link secureLocaleCookie} to the origin `resolveCookieOrigin` returns.
 */
export function withSecureLocaleCookie<
  TRequest,
  TArgs extends unknown[],
  TResponse,
>(
  handler: (request: TRequest, ...args: TArgs) => TResponse,
  resolveCookieOrigin: (request: TRequest) => string | null,
  cookieName = DEFAULT_LOCALE_COOKIE_NAME
): (request: TRequest, ...args: TArgs) => Promise<Awaited<TResponse>> {
  return async (request, ...args) =>
    secureLocaleCookie(
      await handler(request, ...args),
      resolveCookieOrigin(request),
      cookieName
    );
}
