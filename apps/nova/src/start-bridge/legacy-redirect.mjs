/** Production public root. No trailing slash. /novax is a different path. */
export const NOVA_APEX_URL = 'https://tuturuuu.com/nova';

/**
 * G12 pins the permanent 301 only after exact-head review and signed-in QA.
 * This canary stays 307.
 */
export const NOVA_LEGACY_REDIRECT_STATUS = 307;

/** Hosts that remain DNS names and stop serving the app once the apex is baked. */
export const NOVA_LEGACY_HOSTS = [
  'nova.ai.vn',
  'nova.tutur3u.com',
  'nova.tuturuuu.com',
];

const LEGACY_HOSTS = new Set(NOVA_LEGACY_HOSTS);

function isMachinePath(pathname) {
  if (pathname === '/api' || pathname.startsWith('/api/')) return true;
  if (pathname.startsWith('/_serverFn')) return true;
  if (pathname === '/.well-known' || pathname.startsWith('/.well-known/'))
    return true;
  if (pathname === '/_next' || pathname.startsWith('/_next/')) return true;
  if (pathname === '/monitoring' || pathname.startsWith('/monitoring/'))
    return true;
  const last = pathname.split('/').pop() ?? '';
  return last.includes('.');
}

function mountPath(pathname) {
  if (pathname === '/') return '/nova';
  const trimmed =
    pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
  return `/nova${trimmed}`;
}

function bareHost(value) {
  if (typeof value !== 'string') return '';
  const host = value.trim().toLowerCase().replace(/\.$/u, '');
  if (host.endsWith(':80') || host.endsWith(':443'))
    return host.slice(0, host.lastIndexOf(':'));
  if (host.includes(':')) return '';
  return host;
}

/**
 * Accepts only https://tuturuuu.com/nova, with an optional trailing slash.
 * Rejects /novax, extra path, userinfo, query, hash, and a non-default port.
 */
export function isNovaApexRoot(value) {
  if (typeof value !== 'string') return false;
  const raw = value.trim();
  if (!raw || /[\u0000-\u0020\\]/u.test(raw) || raw.includes('%') || raw.includes('@'))
    return false;
  const scheme = raw.indexOf('://');
  if (scheme < 0 || raw.slice(scheme + 3).includes('//') || raw.includes('..'))
    return false;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash || url.port)
    return false;
  if (url.protocol !== 'https:' || url.hostname !== 'tuturuuu.com') return false;
  const path =
    url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, '') : url.pathname;
  return path === '/nova';
}

/** First candidate that is the apex root, or null. */
export function novaBakedApexUrl(candidates) {
  for (const candidate of candidates) {
    if (isNovaApexRoot(candidate)) return NOVA_APEX_URL;
  }
  return null;
}

/**
 * One hop from a legacy Nova host to the apex path.
 * GET and HEAD navigations only. Machine paths, assets, and non-GET stay put.
 * The Location host is fixed. The request host never becomes the target.
 * Returns null when the baked app URL is not the apex, so Vercel and fixture
 * builds keep serving the current host.
 */
export function novaLegacyRedirect(request, appUrl = process.env.NEXT_PUBLIC_APP_URL) {
  if (!isNovaApexRoot(appUrl)) return null;
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const urlHost = bareHost(url.hostname);
  if (urlHost === 'tuturuuu.com') return null;
  const headerHost = bareHost(request.headers.get('host') ?? '');
  const legacy = LEGACY_HOSTS.has(urlHost) || LEGACY_HOSTS.has(headerHost);
  if (!legacy || isMachinePath(url.pathname)) return null;
  const location = new URL(NOVA_APEX_URL);
  location.pathname = mountPath(url.pathname);
  location.search = url.search;
  return new Response(null, {
    status: NOVA_LEGACY_REDIRECT_STATUS,
    headers: {
      Location: location.href,
      'Cache-Control': 'no-store',
    },
  });
}
