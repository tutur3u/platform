/** Production still serves the old host at `/`. The apex is a mount, never the root. */
export const FINANCE_PRODUCTION_ROOT_HOST = 'finance.tuturuuu.com';

export const FINANCE_APEX_URL = 'https://tuturuuu.com/finance';

/**
 * Vite `base` for every profile. Empty on purpose: the Worker applies
 * `/finance` per request, and only after it has classified that request
 * as mounted. Baking `/finance` makes the subdomain root redirect onto
 * `/finance/<workspace id>`, which then 404s.
 * @returns {''}
 */
export function financeBuildBasePath() {
  return '';
}

/**
 * Mounts for one native profile. `rootHost` is the Vite define
 * `VITE_FINANCE_NATIVE_ROOT_HOST`. An empty value admits no host.
 * Passing the apex as the root host throws: that would claim all of tuturuuu.com.
 * `mountHosts` stays empty. Playground's bridge config also rejects
 * unknown hosts and does not list tuturuuu.com. The generated Worker
 * spreads this object over its default, so the apex host is not admitted.
 * The literal return keeps `unknownHost` as `'reject'` for tsc.
 * @returns {{
 *   rootHosts: string[],
 *   mountHosts: string[],
 *   basePath: string,
 *   unknownHost: 'reject'
 * }}
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
    mountHosts: [],
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
