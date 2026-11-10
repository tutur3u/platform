export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown workspace native profile');
  }
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-workspace' : 'tuturuuu-workspace-vite-staging',
    vars: { TUTURUUU_NOINDEX: production ? '0' : '1' },
  };
}
