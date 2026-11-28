/**
 * Origin-wide control over service-worker installs on the shared origin.
 *
 * Browsers send the request header `Service-Worker: script` on every
 * registration and update fetch of a worker script. The gateway serves such a
 * fetch only for the first-party worker scripts below and refuses every other
 * URL, so no uploaded file, JSONP response or other user-influenced
 * same-origin content can be installed as a controlling worker. Requests
 * without the header are never touched.
 */

/**
 * Pathnames of the worker scripts first-party apps register on the shared
 * origin (Web and the root-served apps at `/serwist/sw.js`, plus the Tasks
 * and Calendar mounts). Query strings such as `?v=<stamp>` do not matter; the
 * pathname must match exactly. Add a path here when a new app registers a
 * worker on the shared origin.
 */
export const FIRST_PARTY_SERVICE_WORKER_PATHS: ReadonlySet<string> = new Set([
  '/serwist/sw.js',
  '/tasks/serwist/sw.js',
  '/calendar/serwist/sw.js',
]);

/** An uncached bodyless 403 for a worker script fetch outside the allowlist. */
export function serviceWorkerScriptRefusal(request: Request): Response | null {
  if (!request.headers.has('service-worker')) return null;
  if (FIRST_PARTY_SERVICE_WORKER_PATHS.has(new URL(request.url).pathname)) {
    return null;
  }
  return new Response(null, {
    status: 403,
    headers: { 'Cache-Control': 'no-store' },
  });
}
