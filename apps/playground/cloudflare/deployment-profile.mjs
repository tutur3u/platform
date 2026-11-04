export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown playground native profile');
  }
  const production = value === 'production';
  return {
    name: production
      ? 'tuturuuu-playground'
      : 'tuturuuu-playground-vite-staging',
    vars: { TUTURUUU_NOINDEX: production ? '0' : '1' },
  };
}
