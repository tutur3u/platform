import { negotiateAcceptLanguage } from '@tuturuuu/satellite/accept-language';
import { defaultLocale, type Locale, supportedLocales } from '@/i18n/routing';

function supported(value: string | null | undefined): Locale | null {
  return supportedLocales.includes(value as Locale) ? (value as Locale) : null;
}

/** Path prefix, then cookie, then `fallback` (browser languages). */
export function resolveRequestLocale({
  pathname,
  cookie,
  fallback,
}: {
  pathname: string;
  cookie?: string | null;
  fallback: () => Locale;
}): Locale {
  return supported(pathname.split('/')[1]) ?? supported(cookie) ?? fallback();
}

/** The supported locale best matching an `Accept-Language` header. */
export function preferredRequestLocale(acceptLanguage: string | null): Locale {
  return negotiateAcceptLanguage(
    acceptLanguage,
    supportedLocales,
    defaultLocale
  );
}
