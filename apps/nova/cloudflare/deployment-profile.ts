export function deploymentProfile(
  value = process.env.VITE_NOVA_NATIVE_PROFILE ?? 'staging'
) {
  if (value !== 'staging' && value !== 'production') {
    throw new Error('Expected nova native profile staging or production');
  }
  return {
    name:
      value === 'production' ? 'tuturuuu-nova' : 'tuturuuu-nova-vite-staging',
    vars: { TUTURUUU_NOINDEX: value === 'production' ? '0' : '1' },
  };
}
