const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('gateway production upload stays Wrangler until GATEWAY_CF_VERSION_UPLOAD_LIVE', () => {
  const workflow = readWorkflow('web-opennext.yaml');
  const steps = workflow.jobs.gateway.steps;
  const cfUpload = steps.find(
    (step) =>
      step.name?.includes('cf prebuilt') &&
      step.if === "vars.GATEWAY_CF_VERSION_UPLOAD_LIVE == 'true'"
  );
  const wranglerUpload = steps.find(
    (step) =>
      step.name?.includes('Wrangler publisher fallback') &&
      step.if === "vars.GATEWAY_CF_VERSION_UPLOAD_LIVE != 'true'"
  );
  const cfTraffic = steps.find(
    (step) =>
      step.name?.includes('version from cf upload') &&
      step.if === "vars.GATEWAY_CF_VERSION_UPLOAD_LIVE == 'true'"
  );
  assert.ok(cfUpload?.run?.includes('publish-version-only'));
  assert.ok(wranglerUpload?.run?.includes('wrangler versions upload'));
  assert.ok(cfTraffic?.run?.includes('wrangler versions deploy'));
});
