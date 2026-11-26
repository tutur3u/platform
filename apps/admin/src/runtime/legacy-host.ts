/**
 * The production legacy host: `infrastructure.tuturuuu.com` moves browser
 * navigations to the apex Admin mount. GET/HEAD page requests get a permanent,
 * permalink-preserving 301 to `https://tuturuuu.com/admin<path><query>` before any
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

function canonicalWorkspacePath(pathname: string) {
  return pathname.replace(
    /^(\/admin(?:\/(?:en|vi))?)\/root(?=\/|$)/u,
    '$1/internal'
  );
}

export function mountedRootWorkspaceResponse(
  request: Request
): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== MOUNT_HOST || !isPageRead(request)) return null;

  const pathname = canonicalWorkspacePath(url.pathname);
  if (pathname === url.pathname) return null;
  return mountRedirect(pathname, request.url);
}

function isPageRead(request: Request) {
  return request.method === 'GET' || request.method === 'HEAD';
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
  if (!isPageRead(request) || isApiPath(url.pathname)) return null;

  return mountRedirect(
    canonicalWorkspacePath(mountPathname(url.pathname)),
    request.url
  );
}

function mountRedirect(pathname: string, requestUrl: string): Response {
  const target = new URL(MOUNT_ORIGIN);
  target.pathname = pathname;
  const location = `${target.origin}${target.pathname}${rawQuery(requestUrl)}`;
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
