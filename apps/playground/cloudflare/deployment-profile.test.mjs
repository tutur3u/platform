import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentProfile } from './deployment-profile.mjs';

test('profiles carry only a pinned public build identity', () => {
  const commit = 'a'.repeat(40);
  assert.deepEqual(deploymentProfile('staging', commit), {
    name: 'tuturuuu-playground-vite-staging',
    vars: { PLATFORM_BUILD_COMMIT_HASH: commit },
  });
  assert.deepEqual(deploymentProfile('production', commit), {
    name: 'tuturuuu-playground',
    vars: { PLATFORM_BUILD_COMMIT_HASH: commit },
  });
  assert.throws(() => deploymentProfile('prod', commit), /Unknown/);
  for (const value of ['', 'unknown', 'a'.repeat(39), 'g'.repeat(40)]) {
    assert.throws(() => deploymentProfile('production', value), /40-hex/);
  }
});
