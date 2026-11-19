const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const name = 'api-cloudflare.yaml';

test('api Build Output qualification wires cf parity and dry-run only', () => {
  const workflow = readWorkflow(name);
  assert.equal(workflow.jobs['check-ci'].with.workflow_name, name);
  const steps = workflow.jobs['build-acceptance'].steps;
  const parity = steps.find((step) =>
    step.run?.includes('cf-worker-parity.mjs apps/api')
  );
  const dryRun = steps.find((step) =>
    step.run?.startsWith('bun x --no-install cf deploy --prebuilt')
  );
  assert.ok(parity);
  assert.ok(dryRun);
  assert.match(JSON.stringify(workflow), /cf deploy --prebuilt/);
});