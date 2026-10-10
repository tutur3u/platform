import policy from './seo-policy.json';

export type SeoApp = keyof typeof policy;
export const APP_SEO_POLICY = policy;
export const PRIVATE_ROBOTS_HEADER = 'noindex, nofollow, nosnippet';

// These remain private even where a public dynamic slug pattern could match.
const PRIVATE_PATH_PATTERN =
  '(?:api|auth|login|logout|signup|verify-token|auth-error|add-account|dashboard|onboarding|invite|shared|share|embed|orders|cart|checkout|account|no-access|access-denied|not-whitelisted|not-available|-)(?:/|$)';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  const localePrefix = '(?:(?:en|vi)/)?';

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
