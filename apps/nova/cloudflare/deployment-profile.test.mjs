import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { deploymentProfile } from './deployment-profile.ts';

test('staging and production use isolated route-free Worker identities', () => {
  assert.deepEqual(deploymentProfile('staging'), {
    name: 'tuturuuu-nova-vite-staging',
    vars: { TUTURUUU_NOINDEX: '1' },
  });
  assert.deepEqual(deploymentProfile('production'), {
    name: 'tuturuuu-nova',
    vars: { TUTURUUU_NOINDEX: '0' },
  });
  assert.throws(() => deploymentProfile('prod'), /Expected/);
});

test('artifact seal enforces the selected Worker identity', () => {
  for (const profile of ['staging', 'production']) {
    const result = JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          'import runpy,json; m=runpy.run_path("../../scripts/ci/nova-native-artifact.py"); print(json.dumps(m["load"]().IDENTITY))',
        ],
        {
          cwd: new URL('../', import.meta.url),
          env: { ...process.env, VITE_NOVA_NATIVE_PROFILE: profile },
          encoding: 'utf8',
        }
      )
    );
    assert.equal(result.name, deploymentProfile(profile).name);
    assert.deepEqual(result.vars, deploymentProfile(profile).vars);
  }
});
