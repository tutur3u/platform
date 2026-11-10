/**
 * Origins that may make credentialed cross-origin calls to a satellite API.
 *
 * Production admits only `https://tuturuuu.com` and `https://<sub>.tuturuuu.com`
 * (sibling apps still on their own subdomains). Apps mounted at
 * `tuturuuu.com/<app>` call each other same-origin and need no CORS at all.
 * Loopback and `*.tuturuuu.localhost` development origins are admitted only
 * outside production. The gateway's origin hostnames, which no browser uses,
 * are never admitted.
 */

const GATEWAY_ORIGIN_HOSTNAMES = new Set(['origin.tuturuuu.com']);

const DEVELOPMENT_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'tuturuuu.localhost',
]);

function isProduction() {
  return (
    typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
  );
}

export function getAllowedFirstPartyCorsOrigin(
  origin: string | null | undefined,
  { production = isProduction() }: { production?: boolean } = {}
): string | null {
  if (!origin) return null;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;

  const hostname = url.hostname.toLowerCase();
  if (GATEWAY_ORIGIN_HOSTNAMES.has(hostname)) return null;

  const isTuturuuuHost =
    hostname === 'tuturuuu.com' || hostname.endsWith('.tuturuuu.com');
  if (isTuturuuuHost) {
    return url.protocol === 'https:' || !production ? url.origin : null;
  }

  if (production) return null;

  const isDevelopmentHost =
    DEVELOPMENT_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.tuturuuu.localhost');
  return isDevelopmentHost &&
    (url.protocol === 'http:' || url.protocol === 'https:')
    ? url.origin
    : null;
}
