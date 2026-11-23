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
  // Drop every copy this page can reach first, so a root host keeps a single
  // cookie instead of an older duplicate the server might read.
  clearLocalePreference(cookieName);
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
 * Pick the copy the server reads: Next's request cookies keep the last
 * duplicate, while a mounted app's bridge keeps only the first, its own
 * `Path=<base>` copy (`pick: 'first'`).
 */
export function readLocalePreference(
  cookieHeader: string,
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES,
  cookieName = DEFAULT_LOCALE_COOKIE_NAME,
  pick: 'first' | 'last' = 'last'
): string | null {
  let value: string | undefined;
  for (const pair of cookieHeader.split(/; */u)) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== cookieName)
      continue;
    try {
      value = decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      continue;
    }
    if (pick === 'first') break;
  }
  return value !== undefined && locales.includes(value) ? value : null;
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

/** Stores `locale` and loads the page under it. */
export function switchLocalePreference(
  locale: string,
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES
) {
  persistLocalePreference(locale);
  reloadForLocaleChange(locale, locales);
}

/** The first supported locale among the browser's preferred languages. */
export function matchBrowserLocale(
  languages: readonly string[],
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES,
  fallback = locales[0] ?? 'en'
): string {
  for (const language of languages) {
    const tag = language.toLowerCase();
    const exact = locales.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;
    const base = locales.find(
      (locale) => locale.toLowerCase() === tag.split('-')[0]
    );
    if (base) return base;
  }
  return fallback;
}

/**
 * The path to load after a locale change: the current page under the chosen
 * locale's prefix, keeping an app mount base. A prefix outranks the cookie and
 * every proxy's defaults, including Web's English-only unprefixed public pages,
 * so next-intl never rewrites the cookie to a different locale on that load.
 * Proxies that serve the locale unprefixed redirect there themselves.
 */
export function localeChangePath(
  pathname: string,
  locale: string,
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES,
  base = ''
): string {
  const stripped = stripLocalePrefix(pathname, locales, base);
  const mounted =
    base && (stripped === base || stripped.startsWith(`${base}/`));
  const rest = mounted ? stripped.slice(base.length) : stripped;
  // Collapse leading slashes so the result can never become a
  // protocol-relative URL such as `//example.com`.
  const path = rest.replace(/^\/+/u, '/');
  const suffix = path === '/' || path === '' ? '' : path;
  return `${mounted ? base : ''}/${locale}${suffix}`;
}

/**
 * Loads the current page as a document under `locale`, or under the browser's
 * own language for the system choice (`null`), so the app proxy renders it with
 * the stored preference. A client refresh cannot do that everywhere: native
 * Start loaders run without the proxy's locale negotiation, and a locale path
 * prefix outranks the cookie.
 */
export function reloadForLocaleChange(
  locale: string | null,
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES
) {
  const { hash, pathname, search } = window.location;
  const target =
    locale ?? matchBrowserLocale(window.navigator.languages ?? [], locales);
  window.location.assign(
    `${localeChangePath(pathname, target, locales, browserMountedAppBase())}${search}${hash}`
  );
}
