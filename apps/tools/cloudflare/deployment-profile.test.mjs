import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentProfile } from './deployment-profile.mjs';

const GUARD = {
  binding: 'ABUSE_GUARD',
  service: 'tuturuuu-abuse-guard',
  entrypoint: 'AbuseGuardEntrypoint',
};

test('staging stays separate from production and remains noindex', () => {
  assert.deepEqual(deploymentProfile(), {
    name: 'tuturuuu-tools-vite-staging',
    vars: { TUTURUUU_NOINDEX: '1', ABUSE_GUARD_FAMILIES: 'proxy' },
    services: [GUARD],
  });
  assert.deepEqual(deploymentProfile('production'), {
    name: 'tuturuuu-tools',
    vars: { TUTURUUU_NOINDEX: '0', ABUSE_GUARD_FAMILIES: 'proxy' },
    services: [GUARD],
  });
  assert.throws(() => deploymentProfile('prod'), /Unknown/);
  assert.throws(() => deploymentProfile(''), /Unknown/);
});
