/**
 * Unprefixed-path routing for the Next build, which serves the app under
 * `CALENDAR_BASE_PATH`. Every entry sets `basePath: false`, so Next matches
 * the raw request path instead of prefixing the source. The Next middleware
 * matcher is always basePath-prefixed, so these entries never run through the
 * app proxy; the redirect target does.
 *
 * - Browser documents move to the same path under the mount with a temporary
 *   same-host redirect that keeps the query string.
 * - GET-only API endpoints reached by browsers or monitors (provider OAuth
 *   callbacks, build identity) redirect the same way.
 * - Every other unprefixed `/api/*` path is left to the host. Next serves an
 *   unprefixed path in place only through an external (absolute) rewrite, and
 *   a redirect breaks non-GET or manual-redirect callers such as the
 *   Infrastructure cron gateway. On Vercel, the `routes` entry in
 *   `vercel.json` serves `/api/*` in place before these redirects apply.
 *
 * The native Worker handles the legacy host in `src/runtime/legacy-host.ts`
 * and does not read this config.
 */

export const CALENDAR_BASE_PATH = '/calendar';

/**
 * First path segments that never receive the document redirect: the mount
 * itself (no self-match), APIs, framework and platform assets, the legacy
 * service-worker path (a worker script fetch cannot follow a redirect),
 * telemetry beacons and well-known files.
 */
export const LEGACY_ROOT_EXCLUDED_SEGMENTS = [
  'calendar',
  'api',
  '_next',
  '_vercel',
  'serwist',
  'monitoring',
  '\\.well-known',
] as const;

const EXCLUDED_SEGMENT_PATTERN = `(?:${LEGACY_ROOT_EXCLUDED_SEGMENTS.join('|')})(?:/|$)`;

/** Any non-empty unprefixed path whose first segment is not excluded. */
export const LEGACY_DOCUMENT_SOURCE = `/:path((?!${EXCLUDED_SEGMENT_PATTERN}).+)`;

/**
 * GET-only API endpoints registered or monitored on the unprefixed host:
 * provider OAuth callbacks (browser navigations carrying `code` and `state`)
 * and the public build identity.
 */
export const LEGACY_API_REDIRECT_PATHS = [
  '/api/v1/calendar/auth/callback',
  '/api/v1/calendar/auth/microsoft/callback',
  '/api/build-info',
] as const;

export function createLegacyRootRedirects() {
  return [
    ...LEGACY_API_REDIRECT_PATHS.map((source) => ({
      source,
      destination: `${CALENDAR_BASE_PATH}${source}`,
      basePath: false as const,
      permanent: false,
    })),
    {
      source: '/',
      destination: CALENDAR_BASE_PATH,
      basePath: false as const,
      permanent: false,
    },
    {
      source: LEGACY_DOCUMENT_SOURCE,
      destination: `${CALENDAR_BASE_PATH}/:path`,
      basePath: false as const,
      permanent: false,
    },
  ];
}

/**
 * `no-store` for every legacy redirect source. A 307 is not cacheable without
 * explicit freshness; this also covers routers that apply header routes to
 * redirect responses.
 */
export function createLegacyRootRedirectHeaders() {
  return createLegacyRootRedirects().map(({ source }) => ({
    source,
    basePath: false as const,
    headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
  }));
}
