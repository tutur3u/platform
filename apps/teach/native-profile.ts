export const NATIVE_PROFILE_ENV = 'VITE_TEACH_NATIVE_PROFILE';

export function resolveNativeProfile(value: string | undefined) {
  const name = value || 'staging';
  if (name !== 'staging' && name !== 'production') {
    throw new Error(`Unknown ${NATIVE_PROFILE_ENV}: ${name}`);
  }
  const production = name === 'production';
  return {
    name,
    workerName: production ? 'tuturuuu-teach' : 'tuturuuu-teach-vite-staging',
    noindex: production ? '0' : '1',
  };
}
