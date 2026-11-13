export function deploymentProfile(
  value = process.env.VITE_MIND_NATIVE_PROFILE ?? 'staging'
) {
  if (value !== 'staging' && value !== 'production') {
    throw new Error('Expected mind native profile staging or production');
  }
  return {
    name:
      value === 'production' ? 'tuturuuu-mind' : 'tuturuuu-mind-vite-staging',
    vars: { TUTURUUU_NOINDEX: value === 'production' ? '0' : '1' },
  };
}
