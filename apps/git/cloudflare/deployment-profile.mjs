// The shared abuse guard owns the proxy family in every profile; no staging
// guard Worker exists, so staging binds the shared one too.
export const ABUSE_GUARD_FAMILIES = 'proxy';
export const ABUSE_GUARD_SERVICE = Object.freeze({
  binding: 'ABUSE_GUARD',
  service: 'tuturuuu-abuse-guard',
  entrypoint: 'AbuseGuardEntrypoint',
});

export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown git native profile');
  }
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-git' : 'tuturuuu-git-vite-staging',
    vars: {
      TUTURUUU_NOINDEX: production ? '0' : '1',
      ABUSE_GUARD_FAMILIES,
    },
    services: [{ ...ABUSE_GUARD_SERVICE }],
  };
}
