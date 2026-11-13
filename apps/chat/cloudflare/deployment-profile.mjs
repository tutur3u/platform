export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown chat native profile');
  }
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-chat' : 'tuturuuu-chat-vite-staging',
    vars: { TUTURUUU_NOINDEX: production ? '0' : '1' },
  };
}
