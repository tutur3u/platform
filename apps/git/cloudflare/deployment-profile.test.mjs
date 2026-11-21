import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentProfile } from './deployment-profile.mjs';

test('staging stays separate from production and remains noindex; both bind the abuse guard', () => {
  assert.deepEqual(deploymentProfile(), {
    name: 'tuturuuu-git-vite-staging',
    vars: { TUTURUUU_NOINDEX: '1', ABUSE_GUARD_FAMILIES: 'proxy' },
    services: [
      {
        binding: 'ABUSE_GUARD',
        service: 'tuturuuu-abuse-guard',
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ],
  });
  assert.deepEqual(deploymentProfile('production'), {
    name: 'tuturuuu-git',
    vars: { TUTURUUU_NOINDEX: '0', ABUSE_GUARD_FAMILIES: 'proxy' },
    services: [
      {
        binding: 'ABUSE_GUARD',
        service: 'tuturuuu-abuse-guard',
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ],
  });
  assert.throws(() => deploymentProfile('prod'), /Unknown/);
  assert.throws(() => deploymentProfile(''), /Unknown/);
});
