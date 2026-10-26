import policy from './seo-policy.json';
import {
  escapeSeoRegex as escapeRegex,
  PRIVATE_PATH_PATTERN,
  PRIVATE_ROBOTS_HEADER,
  SEO_LOCALE_PREFIX,
} from './seo-robots';

export { PRIVATE_ROBOTS_HEADER };
export type SeoApp = keyof typeof policy;
export const APP_SEO_POLICY = policy;

/** Next path-to-regexp fragments; every public pattern must match a whole URL. */
export function createSeoHeaders(
  app: SeoApp,
  publicPathPatterns?: readonly string[],
  env: Record<string, string | undefined> = process.env
) {
  const appPolicy = policy[app];
  const publicPatterns = publicPathPatterns ?? [
    ...appPolicy.publicPaths.map(escapeRegex),
    ...appPolicy.publicPatterns,
  ];
  const isPreview =
    env.VERCEL_ENV === 'preview' ||
    env.VERCEL_ENV === 'development' ||
    env.NODE_ENV === 'development' ||
    env.TUTURUUU_NOINDEX === '1';
  const publicPattern = `(?:${publicPatterns.join('|')})/?$`;
  const localePrefix = SEO_LOCALE_PREFIX;

  return [
    {
      // A header reaches redirects, errors, API responses and non-HTML files.
      // Preview builds and apps with no explicit public content fail closed.
      source:
        isPreview || publicPatterns.length === 0
          ? '/:path*'
          : `/:path((?!(?:(?:en|vi)(?:/|$))?${publicPattern}).*)`,
      headers: [{ key: 'X-Robots-Tag', value: PRIVATE_ROBOTS_HEADER }],
    },
    {
      source: `/:path(${localePrefix}${PRIVATE_PATH_PATTERN}.*)`,
      headers: [{ key: 'X-Robots-Tag', value: PRIVATE_ROBOTS_HEADER }],
    },
  ];
}
