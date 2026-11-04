import assert from 'node:assert/strict';

export function deploymentProfile(value = 'staging') {
  assert.ok(
    ['staging', 'production'].includes(value),
    'Unknown tools native profile'
  );
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-tools' : 'tuturuuu-tools-vite-staging',
    vars: { TUTURUUU_NOINDEX: production ? '0' : '1' },
  };
}
