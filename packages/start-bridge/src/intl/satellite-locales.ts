/**
 * `@tuturuuu/satellite/i18n` locale data, safe in every environment. It has
 * no client directive, so in a React Server Components graph `routing`,
 * `supportedLocales` and `defaultLocale` stay real values instead of client
 * references (server code such as `i18n/request.ts` reads them).
 */
export const defaultLocale = 'en' as const;
export const supportedLocales = ['en', 'vi'] as const;
export type Locale = (typeof supportedLocales)[number];
export const routing = { locales: supportedLocales, defaultLocale };

/** English is the unprefixed default; Vietnamese is served under `/vi`. */
export function localize(href: string, locale: string) {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const path = href.replace(/^\/(?:en|vi)(?=\/|$)/u, '') || '/';
  return locale === 'vi' ? `/vi${path === '/' ? '' : path}` : path;
}
