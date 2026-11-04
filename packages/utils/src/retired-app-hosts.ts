/**
 * Domains Tuturuuu no longer controls. Anyone can register them, so neither
 * they nor any subdomain may be trusted, even when a stale environment value
 * or database row still names them. Rewise lives at `rewise.tuturuuu.com`.
 */
export const RETIRED_APP_HOSTNAMES = Object.freeze([
  'rewise.me',
  'rewise.school',
]);

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.+$/u, '');
}

export function isRetiredAppHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);

  return RETIRED_APP_HOSTNAMES.some(
    (retired) => host === retired || host.endsWith(`.${retired}`)
  );
}

/** True when `value` parses as a URL whose host is retired. */
export function isRetiredAppUrl(value: string | URL): boolean {
  try {
    return isRetiredAppHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}
