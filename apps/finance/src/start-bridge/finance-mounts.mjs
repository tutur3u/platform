/** Production still serves the old host at `/`. The apex is a mount, never the root. */
export const FINANCE_PRODUCTION_ROOT_HOST = 'finance.tuturuuu.com';

export const FINANCE_APEX_URL = 'https://tuturuuu.com/finance';

/**
 * Mounts for one native profile. `rootHost` is the Vite define
 * `VITE_FINANCE_NATIVE_ROOT_HOST`. An empty value admits no host.
 * Passing the apex as the root host throws: that would claim all of tuturuuu.com.
 */
export function financeNativeMounts(rootHost) {
  const host = typeof rootHost === 'string' ? rootHost.trim() : '';
  if (host === 'tuturuuu.com') {
    throw new Error(
      'Finance rootHost must stay the subdomain. tuturuuu.com is the mount host.'
    );
  }
  return {
    rootHosts: host ? [host] : [],
    mountHosts: host === FINANCE_PRODUCTION_ROOT_HOST ? ['tuturuuu.com'] : [],
    basePath: '/finance',
    unknownHost: 'reject',
  };
}

/**
 * The public app root baked into a production artifact.
 * Accepts only `https://tuturuuu.com/finance` with an optional trailing slash.
 * Any other candidate, including the old host and `/finance-billing`, is ignored.
 */
export function financeBakedApexUrl(candidates) {
  for (const candidate of candidates) {
    if (isFinanceApexRoot(candidate)) return FINANCE_APEX_URL;
  }
  return null;
}

export function isFinanceApexRoot(value) {
  if (typeof value !== 'string') return false;
  const raw = value.trim();
  if (
    !raw ||
    /[\u0000-\u0020\\]/.test(raw) ||
    raw.includes('%') ||
    raw.includes('@')
  ) {
    return false;
  }
  const scheme = raw.indexOf('://');
  if (
    scheme < 0 ||
    raw.slice(scheme + 3).includes('//') ||
    raw.includes('..')
  ) {
    return false;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash || url.port)
    return false;
  if (url.protocol !== 'https:' || url.hostname !== 'tuturuuu.com')
    return false;
  const path =
    url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, '') : url.pathname;
  return path === '/finance';
}
