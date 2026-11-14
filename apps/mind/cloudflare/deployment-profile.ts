const PRODUCTION_WORKER = 'tuturuuu-mind';
const STAGING_WORKER = 'tuturuuu-mind-vite-staging';
// No staging abuse-guard Worker exists in source, so both profiles bind the
// shared guard. scripts/ci/mind-native-artifact.py allows exactly this one
// non-self service target in a staging artifact.
const ABUSE_GUARD_WORKER = 'tuturuuu-abuse-guard';

export function deploymentProfile(
  value = process.env.VITE_MIND_NATIVE_PROFILE ?? 'staging'
) {
  if (value !== 'staging' && value !== 'production') {
    throw new Error('Expected mind native profile staging or production');
  }
  const name = value === 'production' ? PRODUCTION_WORKER : STAGING_WORKER;
  return {
    name,
    vars: { TUTURUUU_NOINDEX: value === 'production' ? '0' : '1' },
    services: [
      // A Worker references itself: each profile binds its own Worker.
      { binding: 'WORKER_SELF_REFERENCE', service: name },
      {
        binding: 'ABUSE_GUARD',
        service: ABUSE_GUARD_WORKER,
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ],
  };
}
