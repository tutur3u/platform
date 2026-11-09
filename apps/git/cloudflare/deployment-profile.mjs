export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown git native profile');
  }
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-git' : 'tuturuuu-git-vite-staging',
    vars: { TUTURUUU_NOINDEX: production ? '0' : '1' },
  };
}
