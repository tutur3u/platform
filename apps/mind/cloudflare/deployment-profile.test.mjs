import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { deploymentProfile } from './deployment-profile.ts';

test('staging and production use isolated route-free Worker identities', () => {
  const staging = deploymentProfile('staging');
  const production = deploymentProfile('production');
  assert.equal(staging.name, 'tuturuuu-mind-vite-staging');
  assert.deepEqual(staging.vars, { TUTURUUU_NOINDEX: '1' });
  assert.equal(production.name, 'tuturuuu-mind');
  assert.deepEqual(production.vars, { TUTURUUU_NOINDEX: '0' });
  assert.throws(() => deploymentProfile('prod'), /Expected/);
});

test('each profile binds its own Worker and the shared abuse guard', () => {
  const guard = {
    binding: 'ABUSE_GUARD',
    service: 'tuturuuu-abuse-guard',
    entrypoint: 'AbuseGuardEntrypoint',
  };
  assert.deepEqual(deploymentProfile('staging').services, [
    { binding: 'WORKER_SELF_REFERENCE', service: 'tuturuuu-mind-vite-staging' },
    guard,
  ]);
  assert.deepEqual(deploymentProfile('production').services, [
    { binding: 'WORKER_SELF_REFERENCE', service: 'tuturuuu-mind' },
    guard,
  ]);
});

test('staging binds no production Worker', () => {
  const targets = deploymentProfile('staging').services.map((s) => s.service);
  assert.ok(!targets.includes('tuturuuu-mind'));
});

test('void config stays route-free and derives identity from the profile', () => {
  const source = readFileSync(
    new URL('../void.config.ts', import.meta.url),
    'utf8'
  );
  assert.match(source, /name: profile\.name/);
  assert.match(source, /vars: profile\.vars/);
  assert.match(source, /services: profile\.services/);
  assert.match(source, /workers_dev: false/);
  assert.match(source, /preview_urls: false/);
  assert.doesNotMatch(source, /\broutes?\s*:/);
});

test('artifact seal enforces the selected Worker identity and services', () => {
  for (const profile of ['staging', 'production']) {
    const result = JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          `import runpy,json; m=runpy.run_path("../../scripts/ci/mind-native-artifact.py"); a=m["load"]("${profile}"); print(json.dumps({"name": a.IDENTITY["name"], "noindex": a.IDENTITY["vars"]["TUTURUUU_NOINDEX"], "services": a.NORMALIZED_DEFAULTS["services"]}))`,
        ],
        { cwd: new URL('../', import.meta.url), encoding: 'utf8' }
      )
    );
    const expected = deploymentProfile(profile);
    assert.equal(result.name, expected.name);
    assert.equal(result.noindex, expected.vars.TUTURUUU_NOINDEX);
    assert.deepEqual(result.services, expected.services);
  }
});
