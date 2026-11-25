/**
 * Lettin's own routing decides which paths can reach the Node bridge.
 *
 * Every Lettin page and API segment is a locale, a fixed name, a workspace
 * handle (`[a-z0-9_-]`), a GUID, a creator handle (`[A-Za-z0-9_]`) or a
 * fixed enum value, so no Lettin-owned route contains a dot. Real files
 * (`public/`, `/_next/static`) are served by the assets binding before the
 * Worker runs, and `/_next/*` stays with Next.
 *
 * `/api` and `/api/*` are exempt: `next.config.ts` forwards every `/api`
 * path no Lettin handler owns to Web, which serves dotted routes (storage
 * downloads, export assets, `widget.js`). OpenNext matches that fallback
 * with the routes-manifest regex, case-sensitively against the raw
 * (undecoded) pathname, so the exemption uses the same raw, case-sensitive
 * prefix: `/API/x.php` or `/%61pi/x.php` are not forwarded and stay fenced.
 *
 * Any other dotted path matches no route: scanner paths such as
 * `/getcfg.php`, `/index.php/x` or `/.env` answer 404 without entering the
 * bridge.
 */
export function isUnroutableLettinPath(url: URL): boolean {
  const path = url.pathname;
  if (path === '/_next' || path.startsWith('/_next/')) return false;
  if (path === '/api' || path.startsWith('/api/')) return false;
  try {
    return decodeURIComponent(path).includes('.');
  } catch {
    return true;
  }
}

/**
 * Workspace routes whose legitimate work can outlast the header backstop:
 * archive import and preview, Exocorpse import (media copied one by one),
 * archive export and media upload. They keep the runtime's own limits so a
 * long import is never cut off half-applied.
 */
const LONG_RUNNING_ROUTE =
  /^\/api\/v1\/workspaces\/[^/]+\/lettin\/(?:import|exocorpse|export|media)\/?$/u;

/** Header backstop for a Lettin request, or `null` for long-running routes. */
export function lettinHeadersTimeoutMs(url: URL): number | null {
  return LONG_RUNNING_ROUTE.test(url.pathname) ? null : 60_000;
}
