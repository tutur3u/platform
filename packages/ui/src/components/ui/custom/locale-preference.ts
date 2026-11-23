import {
  browserMountedAppBase,
  getTuturuuuBrowserCookieDeleteOptions,
  getTuturuuuBrowserSharedCookieOptions,
} from '@tuturuuu/utils/shared-cookie';
import { deleteCookie, setCookie } from 'cookies-next';

export const DEFAULT_LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
export const DEFAULT_SUPPORTED_LOCALES = ['en', 'vi'] as const;

const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;

export function persistLocalePreference(
  locale: string,
  cookieName = DEFAULT_LOCALE_COOKIE_NAME
) {
  setCookie(
    cookieName,
    locale,
    getTuturuuuBrowserSharedCookieOptions(LOCALE_COOKIE_OPTIONS)
  );
}

export function clearLocalePreference(cookieName = DEFAULT_LOCALE_COOKIE_NAME) {
  for (const options of getTuturuuuBrowserCookieDeleteOptions(
    LOCALE_COOKIE_OPTIONS
  )) {
    deleteCookie(cookieName, options);
  }
}

/**
 * The explicit locale stored in a `Cookie` header string, or `null` when the
 * visitor follows the system language (no cookie, or an unsupported value).
 */
export function readLocalePreference(
  cookieHeader: string,
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES,
  cookieName = DEFAULT_LOCALE_COOKIE_NAME
): string | null {
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== cookieName)
      continue;
    let value = pair.slice(separator + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      continue;
    }
    if (locales.includes(value)) return value;
  }
  return null;
}

/**
 * `pathname` without its locale segment, keeping an app mount base
 * (`/meet/vi/x` → `/meet/x`). A locale prefix outranks the cookie in every
 * proxy, so a locale change must land on the unprefixed path.
 */
export function stripLocalePrefix(
  pathname: string,
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES,
  base = ''
): string {
  const mounted =
    base && (pathname === base || pathname.startsWith(`${base}/`));
  const rest = mounted ? pathname.slice(base.length) : pathname;
  const segments = rest.split('/');
  if (!locales.includes(segments[1] ?? '')) return pathname;
  const stripped = `/${segments.slice(2).join('/')}`;
  return `${mounted ? base : ''}${stripped === '/' && mounted ? '' : stripped}`;
}

/**
 * Loads the current page again as a document so the app proxy resolves the
 * locale from the cookie, or from `Accept-Language` when the cookie is gone.
 * A client refresh cannot do that everywhere: native Start loaders run without
 * the proxy's locale negotiation, and a locale path prefix outranks the cookie.
 */
export function reloadForLocaleChange(
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES
) {
  const { hash, pathname, search } = window.location;
  const target = stripLocalePrefix(pathname, locales, browserMountedAppBase());
  if (target === pathname) {
    window.location.reload();
    return;
  }
  window.location.assign(`${target || '/'}${search}${hash}`);
}
