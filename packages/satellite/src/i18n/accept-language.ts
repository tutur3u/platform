import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';

/** What browsers usually send when a request carries no Accept-Language. */
const MISSING_ACCEPT_LANGUAGE = 'en-US,en;q=0.5';

/**
 * The supported locale that best matches an `Accept-Language` header, for
 * satellite proxies. `match` throws on `*` and on tags `Intl` cannot
 * canonicalize, which clients (Node fetch, some crawlers) do send, so those
 * are skipped; anything unmatched falls back to `defaultLocale`.
 */
export function negotiateAcceptLanguage<Locale extends string>(
  acceptLanguage: string | null | undefined,
  supportedLocales: readonly Locale[],
  defaultLocale: Locale
): Locale {
  const languages = new Negotiator({
    headers: { 'accept-language': acceptLanguage ?? MISSING_ACCEPT_LANGUAGE },
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
  try {
    const matched = match(languages, supportedLocales, defaultLocale);
    return supportedLocales.includes(matched as Locale)
      ? (matched as Locale)
      : defaultLocale;
  } catch {
    return defaultLocale;
  }
}
