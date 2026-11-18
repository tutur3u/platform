// App-owned Worker identity per deployment profile. void.config.ts reads it,
// so the staging candidate and the production Worker build from one source
// while staging stays noindex and production stays indexable.
export const PROFILE_ENV = 'VITE_MARKETING_NATIVE_PROFILE';

const PROFILES = {
  staging: {
    name: 'tuturuuu-marketing-vite-staging',
    workersDev: true,
    vars: { TUTURUUU_NOINDEX: '1' },
  },
  // Live behind marketing.tuturuuu.com and the gateway's MARKETING_ORIGIN.
  production: {
    name: 'tuturuuu-marketing',
    workersDev: false,
    vars: { TUTURUUU_NOINDEX: '0' },
  },
};

/**
 * The profile for a build. Production refuses a build environment that still
 * carries the staging noindex flag, so a copied CI environment cannot ship a
 * de-indexed production Worker.
 */
export function deploymentProfile(
  value = 'staging',
  env = globalThis.process?.env ?? {}
) {
  const profile = Object.hasOwn(PROFILES, value) ? PROFILES[value] : null;
  if (!profile) throw new Error(`Unknown marketing native profile: ${value}`);
  if (value === 'production' && env.TUTURUUU_NOINDEX === '1') {
    throw new Error(
      'Production marketing build must not set TUTURUUU_NOINDEX=1'
    );
  }
  return { ...profile, vars: { ...profile.vars } };
}
