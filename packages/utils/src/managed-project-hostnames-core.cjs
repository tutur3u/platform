// Shared by apps/web, apps/infrastructure and scripts/watch-blue-green, which
// is plain Node and cannot import TypeScript; keep this file dependency-free.

/** Platform cookie zones; managed projects may not claim them or any subdomain. */
const PLATFORM_HOSTNAME_ZONES = Object.freeze([
  'tuturuuu.com',
  'staging.tutur3u.com',
]);

/** Exact platform names outside the zones above. */
const RESERVED_MANAGED_PROJECT_HOSTNAMES = Object.freeze([
  'localhost',
  'nova.ai.vn',
  'rewise.me',
]);

/** Lowercase, trim, and strip a scheme, path and trailing dots. */
function normalizeManagedProjectHostname(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/\/.*$/u, '')
    .replace(/\.+$/u, '');
}

function isReservedManagedProjectHostname(value) {
  const hostname = normalizeManagedProjectHostname(value);
  return (
    RESERVED_MANAGED_PROJECT_HOSTNAMES.includes(hostname) ||
    PLATFORM_HOSTNAME_ZONES.some(
      (zone) => hostname === zone || hostname.endsWith(`.${zone}`)
    )
  );
}

module.exports = {
  isReservedManagedProjectHostname,
  normalizeManagedProjectHostname,
  PLATFORM_HOSTNAME_ZONES,
  RESERVED_MANAGED_PROJECT_HOSTNAMES,
};
