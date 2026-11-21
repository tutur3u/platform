/**
 * The production legacy host: `infrastructure.tuturuuu.com` moves browser
 * navigations to the apex Admin mount. GET/HEAD page requests get a permanent,
 * path-preserving 301 to `https://tuturuuu.com/admin<path><query>` before any
 * auth, locale or app handling. Machine traffic keeps being served on the
 * subdomain: every `/api` request (cron, mobile and desktop deployment
 * bundles, devbox and SDK callers send bearer credentials that HTTP clients
 * drop on a cross-host redirect) and every other method. The apex mount never
 * redirects back to the subdomain, so a cached 301 cannot loop after a
 * rollback. The target origin and base are fixed constants, never read from
 * the request, so no Host, forwarded header, path or query can change them.
 */
const LEGACY_HOST = 'infrastructure.tuturuuu.com';
const MOUNT_HOST = 'tuturuuu.com';
const MOUNT_ORIGIN = `https://${MOUNT_HOST}`;
const MOUNT_BASE = '/admin';
/** API callers (machine traffic) stay on the subdomain. */
const API_PREFIX = '/api';
const PRIVATE_NO_STORE = 'private, no-store';

interface LegacyHostMounts {
  mountHosts?: readonly string[];
}

/** Only the production Worker serves the legacy host; it sets this var. */
export function legacyHostRedirectEnabled(env: {
  TUTURUUU_LEGACY_HOST_REDIRECT?: string;
}) {
  return env.TUTURUUU_LEGACY_HOST_REDIRECT === '1';
}

/** The mount pathname for a legacy pathname: leading slashes and backslashes
 * collapse to one `/`, and a path already under `/admin` keeps its prefix. */
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

/** Whether a legacy-host request is an API call, after slash collapsing. */
function isApiPath(pathname: string) {
  const path = pathname.replace(/^[/\\]+/u, '/');
  return path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

/**
 * The legacy-host redirect, or `null` when the request is not for the legacy
 * host, the artifact has no apex mount (the staging profile), or it is
 * machine traffic (an `/api` path or a method other than GET/HEAD).
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
  if ((method !== 'GET' && method !== 'HEAD') || isApiPath(url.pathname))
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
    status: 301,
    headers: { 'Cache-Control': PRIVATE_NO_STORE, Location: location },
  });
}
