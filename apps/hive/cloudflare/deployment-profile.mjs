export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown hive native profile');
  }
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-hive' : 'tuturuuu-hive-vite-staging',
    vars: { TUTURUUU_NOINDEX: production ? '0' : '1' },
  };
}
