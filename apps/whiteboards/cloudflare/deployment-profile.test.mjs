import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentProfile } from './deployment-profile.mjs';

test('staging stays separate from production and remains noindex', () => {
  assert.deepEqual(deploymentProfile(), {
    name: 'tuturuuu-whiteboards-vite-staging',
    vars: { TUTURUUU_NOINDEX: '1' },
  });
  assert.deepEqual(deploymentProfile('production'), {
    name: 'tuturuuu-whiteboards',
    vars: { TUTURUUU_NOINDEX: '0' },
  });
  assert.throws(() => deploymentProfile('prod'), /Unknown/);
  assert.throws(() => deploymentProfile(''), /Unknown/);
});
