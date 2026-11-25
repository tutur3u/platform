/**
 * Paths that only vulnerability scanners request: server-side script and
 * backup extensions, dotfile path segments (`.git`, `.env`, `.DS_Store`, …)
 * and credential files at the site root. None of them exists on any Tuturuuu
 * app, and the Web app would otherwise render each probe as a full dashboard
 * document (HTTP 200, about 2.6 MB). The gateway answers them with a small
 * 404 before the Web and Marketing families run; mounted apps keep their own
 * paths.
 *
 * API paths are never matched: the meeting collaboration preview proxies
 * arbitrary paths under `/api/`, and APIs answer their own unknown routes.
 * `/.well-known/` stays with the apps.
 */
const PROBE_EXTENSION =
  /\.(?:php\d?|phtml|asp|aspx|jsp|cgi|sql|bak|old|swp|env|ini)$/iu;
// Only dotted names: workspace handles cannot contain `.`, so a segment rule
// never shadows `tuturuuu.com/<handle>` (names such as `wordpress` or
// `wp-admin` are valid handles).
const PROBE_SEGMENT =
  /^(?:\.git|\.svn|\.hg|\.env(?:\.[^/]*)?|\.aws|\.ssh|\.ds_store)$/iu;

/**
 * Credential and server-config files scanners request at the site root. Every
 * entry contains a `.`, so none can be a workspace handle.
 */
const PROBE_ROOT_FILES = new Set([
  '/config.js',
  '/config.json',
  '/credentials.json',
  '/secrets.json',
  '/service-account.json',
  '/appsettings.json',
  '/web.config',
  '/docker-compose.yml',
  '/.npmrc',
  '/.dockerenv',
]);

export function isScannerProbe(pathname: string): boolean {
  if (pathname.includes('/api/') || pathname.startsWith('/.well-known/'))
    return false;
  if (PROBE_ROOT_FILES.has(pathname.toLowerCase())) return true;
  if (PROBE_EXTENSION.test(pathname)) return true;
  return pathname.split('/').some((segment) => PROBE_SEGMENT.test(segment));
}

/**
 * An hour of browser caching. The Worker builds the response in front of the
 * edge cache, so it is never stored there; a short lifetime keeps a path
 * that later becomes a real route from staying 404 for long.
 */
export function scannerProbeResponse(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Gateway-Cache': 'PROBE',
      'X-Robots-Tag': 'noindex',
    },
  });
}
