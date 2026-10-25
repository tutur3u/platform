import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
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
  const languages = new Negotiator({
    headers: { 'accept-language': acceptLanguage ?? 'en-US,en;q=0.5' },
  })
    .languages()
    .flatMap((language) => {
      if (language === '*') return [];
      try {
        return Intl.getCanonicalLocales(language);
      } catch {
        return [];
      }
    });
  return (
    supported(match(languages, supportedLocales, defaultLocale)) ??
    defaultLocale
  );
}
