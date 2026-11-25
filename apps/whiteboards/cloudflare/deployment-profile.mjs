/**
 * The two native Whiteboards Worker identities. Staging is the default;
 * production must be requested through `VITE_WHITEBOARDS_NATIVE_PROFILE`.
 * Neither profile declares routes or hostnames: those are attached by the
 * release operator after acceptance.
 */
export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown whiteboards native profile');
  }
  const production = value === 'production';
  return {
    name: production
      ? 'tuturuuu-whiteboards'
      : 'tuturuuu-whiteboards-vite-staging',
    vars: { TUTURUUU_NOINDEX: production ? '0' : '1' },
  };
}
