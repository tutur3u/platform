export function deploymentProfile(value = 'staging') {
  if (!['staging', 'production'].includes(value)) {
    throw new Error('Unknown infrastructure native profile');
  }
  const production = value === 'production';
  return {
    name: production
      ? 'tuturuuu-infrastructure'
      : 'tuturuuu-infrastructure-vite-staging',
    vars: production
      ? {
          TUTURUUU_NOINDEX: '0',
          NODE_ENV: 'production',
          TUTURUUU_REQUIRE_SECRETS: '1',
          NEXT_PUBLIC_APP_URL: 'https://infrastructure.tuturuuu.com',
          NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
        }
      : { TUTURUUU_NOINDEX: '1' },
    uploadSourceMaps: !production,
  };
}
