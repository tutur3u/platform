/**
 * English is the default locale and has no path prefix, like every other
 * Tuturuuu app: `/`, `/ship`, `/fleet-access`; Vietnamese keeps `/vi/...`.
 * Old `/en/...` links answer a permanent redirect to the unprefixed path.
 */

/**
 * The unprefixed path for a legacy `/en` path, or null when `pathname` has
 * no `/en` prefix. Never protocol-relative: `/en//host` maps to `/`.
 */
export function legacyDefaultLocalePath(pathname: string): string | null {
  if (pathname !== '/en' && !pathname.startsWith('/en/')) return null;
  const rest = pathname.slice('/en'.length) || '/';
  return rest.startsWith('//') ? '/' : rest;
}

/** A permanent redirect from a legacy `/en` URL, keeping its query. */
export function legacyLocaleRedirect(url: URL): Response | null {
  const path = legacyDefaultLocalePath(url.pathname);
  if (path === null) return null;
  return new Response(null, {
    status: 308,
    headers: { Location: `${path}${url.search}` },
  });
}
