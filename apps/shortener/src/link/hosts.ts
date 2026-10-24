/** The canonical short-link host; every configured alias redirects here. */
export const CANONICAL_HOST = 'ttr.gg';

/**
 * The seven production domains configured on the legacy Vercel project. Alias
 * statuses mirror that project; entries Vercel reported without an explicit
 * status use its 307 default until the release record captures otherwise.
 */
export const HOST_REDIRECTS: Readonly<Record<string, 307 | 308>> = {
  'shortener.tuturuuu.com': 307,
  'tuturuu.com': 307,
  'www.tuturuu.com': 307,
  'tutur3u.com': 307,
  'www.tutur3u.com': 307,
  'www.ttr.gg': 308,
};

export const PRODUCTION_HOSTS: ReadonlySet<string> = new Set([
  CANONICAL_HOST,
  ...Object.keys(HOST_REDIRECTS),
]);

/** Domain redirects keep the path and the raw query, duplicates included. */
export function hostRedirect(url: URL, search: string): Response | null {
  const status = HOST_REDIRECTS[url.hostname];
  if (!status) return null;
  return new Response(null, {
    status,
    headers: { Location: `https://${CANONICAL_HOST}${url.pathname}${search}` },
  });
}
