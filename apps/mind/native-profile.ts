export const NATIVE_PROFILE_ENV = 'VITE_MIND_NATIVE_PROFILE';

export function resolveNativeProfile(value: string | undefined) {
  const name = value || 'staging';
  if (name !== 'staging' && name !== 'production') {
    throw new Error(`Unknown ${NATIVE_PROFILE_ENV}: ${name}`);
  }
  const production = name === 'production';
  return {
    name,
    workerName: production ? 'tuturuuu-mind' : 'tuturuuu-mind-vite-staging',
    noindex: production ? '0' : '1',
  };
}
