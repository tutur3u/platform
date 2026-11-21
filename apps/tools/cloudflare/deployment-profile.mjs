// The shared abuse guard, reached over RPC with no public endpoint or shared
// signing secret. No staging guard Worker exists, so every profile binds it.
export const ABUSE_GUARD_SERVICE = Object.freeze({
  binding: 'ABUSE_GUARD',
  service: 'tuturuuu-abuse-guard',
  entrypoint: 'AbuseGuardEntrypoint',
});
// Families served by the binding; `proxy` backs the edge IP-block store.
export const ABUSE_GUARD_FAMILIES = 'proxy';

export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown tools native profile');
  }
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-tools' : 'tuturuuu-tools-vite-staging',
    vars: {
      TUTURUUU_NOINDEX: production ? '0' : '1',
      ABUSE_GUARD_FAMILIES,
    },
    services: [{ ...ABUSE_GUARD_SERVICE }],
  };
}
