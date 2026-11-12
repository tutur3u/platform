import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentProfile } from './deployment-profile.mjs';

test('staging stays separate from production and remains noindex', () => {
  assert.deepEqual(deploymentProfile(), {
    name: 'tuturuuu-infrastructure-vite-staging',
    vars: { TUTURUUU_NOINDEX: '1' },
    uploadSourceMaps: true,
  });
  assert.deepEqual(deploymentProfile('production'), {
    name: 'tuturuuu-infrastructure',
    vars: {
      TUTURUUU_NOINDEX: '0',
      NODE_ENV: 'production',
      TUTURUUU_REQUIRE_SECRETS: '1',
      NEXT_PUBLIC_APP_URL: 'https://infrastructure.tuturuuu.com',
      NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
    },
    uploadSourceMaps: false,
  });
  assert.throws(() => deploymentProfile('prod'), /Unknown/);
  assert.throws(() => deploymentProfile(''), /Unknown/);
});
