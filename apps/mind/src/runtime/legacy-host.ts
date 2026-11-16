/**
 * The production legacy host: `mind.tuturuuu.com` only moves visitors to the
 * apex mount. Every method gets a path-preserving 307 to
 * `https://tuturuuu.com/mind<path><query>` before any auth, locale or app
 * handling. The target origin and base are fixed constants, never read from
 * the request, so no Host, forwarded header, path or query can change them.
 */
const LEGACY_HOST = 'mind.tuturuuu.com';
const MOUNT_HOST = 'tuturuuu.com';
const MOUNT_ORIGIN = `https://${MOUNT_HOST}`;
const MOUNT_BASE = '/mind';
/** Monitoring keeps reading the subdomain's build identity directly. */
const BUILD_INFO_PATH = '/api/build-info';
const PRIVATE_NO_STORE = 'private, no-store';

interface LegacyHostMounts {
  mountHosts?: readonly string[];
}

/** The mount pathname for a legacy pathname: leading slashes and backslashes
 * collapse to one `/`, and a path already under `/mind` keeps its prefix. */
function mountPathname(pathname: string) {
  const path = pathname.replace(/^[/\\]+/u, '/');
  if (path === MOUNT_BASE || path.startsWith(`${MOUNT_BASE}/`)) return path;
  return path === '/' ? MOUNT_BASE : `${MOUNT_BASE}${path}`;
}

function insideMount(target: URL) {
  return (
    target.origin === MOUNT_ORIGIN &&
    !target.username &&
    !target.password &&
    (target.pathname === MOUNT_BASE ||
      target.pathname.startsWith(`${MOUNT_BASE}/`))
  );
}

/** The request's query exactly as received, including a bare `?`. */
function rawQuery(requestUrl: string) {
  const start = requestUrl.indexOf('?');
  if (start < 0) return '';
  const end = requestUrl.indexOf('#', start);
  return end < 0 ? requestUrl.slice(start) : requestUrl.slice(start, end);
}

/**
 * The legacy-host redirect, or `null` when the request is not for the legacy
 * host, the artifact has no apex mount (the staging profile), or the request
 * reads the build identity.
 */
export function legacyHostResponse(
  request: Request,
  mounts: LegacyHostMounts
): Response | null {
  if (!mounts.mountHosts?.some((host) => host.toLowerCase() === MOUNT_HOST))
    return null;
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== LEGACY_HOST) return null;
  const method = request.method.toUpperCase();
  if (
    url.pathname === BUILD_INFO_PATH &&
    (method === 'GET' || method === 'HEAD')
  )
    return null;

  const target = new URL(MOUNT_ORIGIN);
  target.pathname = mountPathname(url.pathname);
  const query = rawQuery(request.url);
  const location = `${target.origin}${target.pathname}${query}`;
  if (!insideMount(target) || !insideMount(new URL(location)))
    return new Response(null, {
      status: 400,
      headers: { 'Cache-Control': PRIVATE_NO_STORE },
    });
  return new Response(null, {
    status: 307,
    headers: { 'Cache-Control': PRIVATE_NO_STORE, Location: location },
  });
}
