/**
 * Origins that may make credentialed cross-origin calls to a satellite API.
 *
 * Fails closed. Outside development and test it admits only
 * `https://tuturuuu.com` and `https://<label>.tuturuuu.com`: one label deep,
 * on the default port, no credentials in the URL (sibling apps still on their
 * own subdomains). Apps mounted at `tuturuuu.com/<app>` call each other
 * same-origin and need no CORS at all. Loopback, `*.tuturuuu.localhost` and
 * non-https Tuturuuu origins are admitted only when `NODE_ENV` is
 * `development` or `test`. The gateway's origin hostnames, which no browser
 * uses, are never admitted.
 */

const GATEWAY_ORIGIN_HOSTNAMES = new Set(['origin.tuturuuu.com']);

const DEVELOPMENT_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'tuturuuu.localhost',
]);

/** One label below the apex, e.g. `tasks` in `tasks.tuturuuu.com`. */
const SINGLE_LABEL_SUBDOMAIN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.tuturuuu\.com$/u;

function isDevelopmentEnvironment() {
  if (typeof process === 'undefined') return false;
  const environment = process.env.NODE_ENV;
  return environment === 'development' || environment === 'test';
}

export function getAllowedFirstPartyCorsOrigin(
  origin: string | null | undefined,
  { development = isDevelopmentEnvironment() }: { development?: boolean } = {}
): string | null {
  if (!origin) return null;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const hostname = url.hostname.toLowerCase();
  if (GATEWAY_ORIGIN_HOSTNAMES.has(hostname)) return null;

  const isTuturuuuHost =
    hostname === 'tuturuuu.com' || SINGLE_LABEL_SUBDOMAIN.test(hostname);
  if (isTuturuuuHost) {
    if (development) return url.origin;
    return url.protocol === 'https:' && url.port === '' ? url.origin : null;
  }

  if (!development) return null;

  const isDevelopmentHost =
    DEVELOPMENT_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.tuturuuu.localhost');
  return isDevelopmentHost ? url.origin : null;
}
