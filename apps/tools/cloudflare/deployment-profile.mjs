export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown tools native profile');
  }
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-tools' : 'tuturuuu-tools-vite-staging',
    vars: { TUTURUUU_NOINDEX: production ? '0' : '1' },
  };
}
