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

test('void config stays route-free and derives identity from the profile', () => {
  const source = readFileSync(
    new URL('../void.config.ts', import.meta.url),
    'utf8'
  );
  assert.match(source, /name: profile\.name/);
  assert.match(source, /vars: profile\.vars/);
  // Both profiles carry the same two service bindings, declared literally.
  assert.match(
    source,
    /binding: 'WORKER_SELF_REFERENCE',\s+service: 'tuturuuu-mind'/
  );
  assert.match(
    source,
    /binding: 'ABUSE_GUARD',\s+service: 'tuturuuu-abuse-guard',\s+entrypoint: 'AbuseGuardEntrypoint'/
  );
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
    assert.deepEqual(result.services, [
      { binding: 'WORKER_SELF_REFERENCE', service: 'tuturuuu-mind' },
      {
        binding: 'ABUSE_GUARD',
        service: 'tuturuuu-abuse-guard',
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ]);
  }
});
