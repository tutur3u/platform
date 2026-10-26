/**
 * Robots decisions shared by Next (`seo.ts` headers) and native Workers (the
 * start-bridge response policy). No imports: Workers and Node type stripping
 * load this module directly; the per-app data (`seo-policy.json`) is passed
 * in by the caller.
 */
export const PRIVATE_ROBOTS_HEADER = 'noindex, nofollow, nosnippet';

// These remain private even where a public dynamic slug pattern could match.
export const PRIVATE_PATH_PATTERN =
  '(?:api|auth|login|logout|signup|verify-token|auth-error|add-account|dashboard|onboarding|invite|shared|share|embed|orders|cart|checkout|account|no-access|access-denied|not-whitelisted|not-available|-)(?:/|$)';

export const SEO_LOCALE_PREFIX = '(?:(?:en|vi)/)?';

/** One app's entry in `seo-policy.json`. */
export interface AppSeoPolicy {
  origin: string;
  publicPaths: readonly string[];
  publicPatterns: readonly string[];
}

export function escapeSeoRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `X-Robots-Tag` for a request, or `null` when the URL may be indexed: only
 * the app's public allowlist, on its canonical origin, outside reserved
 * private paths, and never on a preview/staging (`noindex`) deployment. An
 * unknown app (no policy) stays private.
 */
export function robotsForUrl(
  policy: AppSeoPolicy | null | undefined,
  url: URL,
  options: { noindex?: boolean } = {}
): string | null {
  if (!policy || options.noindex) return PRIVATE_ROBOTS_HEADER;
  if (url.origin !== new URL(policy.origin).origin)
    return PRIVATE_ROBOTS_HEADER;
  const patterns = [
    ...policy.publicPaths.map(escapeSeoRegex),
    ...policy.publicPatterns,
  ];
  if (patterns.length === 0) return PRIVATE_ROBOTS_HEADER;
  const path = url.pathname.replace(/^\//u, '');
  if (
    new RegExp(`^${SEO_LOCALE_PREFIX}${PRIVATE_PATH_PATTERN}`, 'u').test(path)
  )
    return PRIVATE_ROBOTS_HEADER;
  const isPublic = new RegExp(
    `^(?:(?:en|vi)(?:/|$))?(?:${patterns.join('|')})/?$`,
    'u'
  ).test(path);
  return isPublic ? null : PRIVATE_ROBOTS_HEADER;
}
