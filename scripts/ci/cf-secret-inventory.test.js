// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: isolated fixture shell environment.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const steps = readWorkflow('coordination-cloudflare.yaml').jobs.deploy.steps;
const publication = steps.findIndex(
  (step) =>
    step.name === 'Publish the exact artifact with retained migration tags'
);
const phases = [
  ['before', 'Require pre-provisioned server credentials'],
  ['after', 'Verify the coordination token survived publication'],
];

for (const [phase, name] of phases) {
  test(`Coordination ${phase} secret gate consumes its fatal settings snapshot`, () => {
    const capture = steps.findIndex((step) =>
      step.run?.includes(`cf-worker-settings.mjs ${phase} `)
    );
    const verify = steps.findIndex((step) => step.name === name);
    assert.ok(capture >= 0 && verify > capture);
    assert.equal(steps[capture]['continue-on-error'], undefined);
    assert.equal(steps[verify]['continue-on-error'], undefined);
    if (phase === 'before') assert.ok(verify < publication);
    else assert.ok(capture > publication);
    assert.match(steps[verify].run.trim(), /^jq -e /);
  });

  for (const [label, content, accepted] of [
    ['present', { secrets: ['OTHER', 'COORDINATION_TOKEN'] }, true],
    ['missing', { secrets: ['OTHER'] }, false],
    ['string instead of array', { secrets: 'COORDINATION_TOKEN' }, false],
    [
      'objects instead of names',
      { secrets: [{ name: 'COORDINATION_TOKEN' }] },
      false,
    ],
    ['missing field', {}, false],
    ['invalid JSON', '{', false],
  ]) {
    test(`Coordination ${phase} secret gate ${accepted ? 'accepts' : 'rejects'} ${label}`, (t) => {
      const verify = steps.find((step) => step.name === name);
      assert.match(verify.run.trim(), /^jq -e /);
      const directory = mkdtempSync(join(tmpdir(), 'cf-secret-inventory-'));
      t.after(() => rmSync(directory, { recursive: true, force: true }));
      writeFileSync(
        join(directory, `coordination-settings-${phase}.json`),
        typeof content === 'string' ? content : JSON.stringify(content),
        { mode: 0o600 }
      );
      const result = spawnSync(
        'bash',
        ['-e', '-o', 'pipefail', '-c', verify.run],
        {
          encoding: 'utf8',
          env: { PATH: process.env.PATH, RUNNER_TEMP: directory },
        }
      );
      assert.ifError(result.error);
      assert.equal(result.status === 0, accepted, result.stderr);
    });
  }
}
