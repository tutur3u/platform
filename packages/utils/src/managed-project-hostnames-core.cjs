// Shared by apps/web, apps/infrastructure and scripts/watch-blue-green, which
// is plain Node and cannot import TypeScript; keep this file dependency-free.

/** Platform cookie zones; managed projects may not claim them or any subdomain. */
const PLATFORM_HOSTNAME_ZONES = Object.freeze([
  'tuturuuu.com',
  // Staging apex and every <app>.tutur3u.com host: a customer-controlled
  // subdomain could set Domain=tutur3u.com cookies that the apex receives.
  'tutur3u.com',
  'staging.tutur3u.com',
]);

/** Exact platform names outside the zones above. */
const RESERVED_MANAGED_PROJECT_HOSTNAMES = Object.freeze([
  'localhost',
  'nova.ai.vn',
  'rewise.me',
]);

/** ASCII DNS name: at most 253 characters and 63 per label, no port or path. */
const SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

// Longest raw input worth parsing: a 253-character name plus a scheme, path
// and surrounding whitespace. Longer input is rejected before any regex runs.
const MAX_HOSTNAME_INPUT_LENGTH = 512;
// Fails the safe pattern, so callers reject it as an invalid DNS name.
const INVALID_HOSTNAME = '<invalid hostname>';

/** Lowercase, trim, and strip a scheme, path and trailing dots. */
function normalizeManagedProjectHostname(value) {
  const raw = String(value ?? '');
  if (raw.length > MAX_HOSTNAME_INPUT_LENGTH) return INVALID_HOSTNAME;
  const hostname = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/\/.*$/u, '');
  let end = hostname.length;
  while (end > 0 && hostname[end - 1] === '.') end -= 1;
  return hostname.slice(0, end);
}

function isSafeManagedProjectHostname(value) {
  return SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN.test(
    normalizeManagedProjectHostname(value)
  );
}

/** Fails closed: anything that is not a safe DNS name counts as reserved. */
function isReservedManagedProjectHostname(value) {
  const hostname = normalizeManagedProjectHostname(value);
  return (
    !SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN.test(hostname) ||
    RESERVED_MANAGED_PROJECT_HOSTNAMES.includes(hostname) ||
    PLATFORM_HOSTNAME_ZONES.some(
      (zone) => hostname === zone || hostname.endsWith(`.${zone}`)
    )
  );
}

module.exports = {
  isReservedManagedProjectHostname,
  isSafeManagedProjectHostname,
  MAX_HOSTNAME_INPUT_LENGTH,
  normalizeManagedProjectHostname,
  PLATFORM_HOSTNAME_ZONES,
  RESERVED_MANAGED_PROJECT_HOSTNAMES,
  SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN,
};
