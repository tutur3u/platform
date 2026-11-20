const assert = require('node:assert/strict');
const { existsSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const name = 'gateway-cloudflare.yaml';

test('gateway Build Output qualification wires cf parity and dry-run only', () => {
  const workflow = readWorkflow(name);
  assert.equal(workflow.jobs['check-ci'].with.workflow_name, name);
  const steps = workflow.jobs['build-acceptance'].steps;
  const parity = steps.find((step) =>
    step.run?.includes('cf-worker-parity.mjs apps/gateway')
  );
  const dryRun = steps.find((step) =>
    step.run?.startsWith('bun x --no-install cf deploy --prebuilt')
  );
  assert.ok(parity);
  assert.ok(dryRun);
});

test('gateway publication rehearsal uses fixture origins and leaves the Build Output available for upload', async (t) => {
  const { rehearseGatewayCfPublication } =
    await import('./gateway-cf-publication.mjs');
  const { jobs } = readWorkflow(name);
  const steps = jobs['build-acceptance'].steps;
  const rehearsal = steps.find((step) =>
    step.run?.includes('gateway-cf-publication.mjs rehearse')
  );
  assert.ok(rehearsal);
  const appRoot = mkdtempSync(join(tmpdir(), 'gateway-build-output-'));
  t.after(() => rmSync(appRoot, { recursive: true, force: true }));
  const buildOutput = join(appRoot, '.cloudflare/output/v0');
  mkdirSync(buildOutput, { recursive: true });

  const result = rehearseGatewayCfPublication({
    settingsPath: join(__dirname, 'fixtures/gateway-settings-fixture.json'),
    appRoot,
    env: { ...rehearsal.env, RUNNER_TEMP: appRoot },
    exec(command, args) {
      assert.equal(command, 'bun');
      assert.ok(args.includes('--dry-run'));
      assert.ok(args.includes('--no-provision'));
    },
  });
  assert.equal(result.publicationQualified, true);
  assert.ok(existsSync(buildOutput));
});
