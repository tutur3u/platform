import {
  getLocaleCookieOptions,
  withSecureLocaleCookie,
} from '@tuturuuu/utils/locale-cookie';
import type { CookieOptionsLike } from '@tuturuuu/utils/shared-cookie';
import type { NextRequest } from 'next/server';
import { resolveCanonicalRequestOrigin } from './proxy/canonical-origin';

/**
 * Canonical-origin locale cookie scope for satellite proxies. The cookie origin
 * comes from {@link resolveCanonicalRequestOrigin}: a configured canonical
 * origin, or a gateway-proven forwarded host, never the raw `Host` or an
 * unproven `X-Forwarded-Host`. See `@tuturuuu/utils/locale-cookie` for the
 * attributes it derives.
 */

export interface LocaleCookieOrigins {
  /** The app's canonical public origins; the first valid one is the fallback. */
  canonicalOrigins: readonly string[];
  /** The central web app URL, trusted when the app is served under it. */
  webAppUrl?: string;
  /** Defaults to `NEXT_LOCALE`. */
  cookieName?: string;
}

/** The canonical origin a locale cookie is scoped to, or `null`. */
export function resolveLocaleCookieOrigin(
  request: NextRequest,
  origins: LocaleCookieOrigins
): string | null {
  return resolveCanonicalRequestOrigin(
    request,
    origins.webAppUrl ?? '',
    origins.canonicalOrigins
  );
}

/** Locale cookie options scoped to the request's canonical origin. */
export function getCanonicalLocaleCookieOptions<
  TOptions extends CookieOptionsLike,
>(
  request: NextRequest,
  origins: LocaleCookieOrigins,
  options: TOptions
): TOptions {
  return getLocaleCookieOptions(
    options,
    resolveLocaleCookieOrigin(request, origins)
  );
}

/**
 * Wraps a satellite proxy so every locale cookie it emits is scoped to the
 * request's canonical origin.
 */
export function withCanonicalLocaleCookie<TArgs extends unknown[], TResponse>(
  handler: (request: NextRequest, ...args: TArgs) => TResponse,
  origins: LocaleCookieOrigins
): (request: NextRequest, ...args: TArgs) => Promise<Awaited<TResponse>> {
  return withSecureLocaleCookie(
    handler,
    (request: NextRequest) => resolveLocaleCookieOrigin(request, origins),
    origins.cookieName
  );
}
