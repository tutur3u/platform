export const AI_NATIVE_PROFILE_ENV = 'VITE_AI_NATIVE_PROFILE';

export function resolveAiNativeProfile(value: string | undefined) {
  const name = value || 'staging';
  if (name !== 'staging' && name !== 'production') {
    throw new Error(`Unknown ${AI_NATIVE_PROFILE_ENV}: ${name}`);
  }
  return {
    name,
    workerName:
      name === 'production' ? 'tuturuuu-ai' : 'tuturuuu-ai-vite-staging',
  };
}
