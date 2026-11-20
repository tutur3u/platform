const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('gateway upload stays Wrangler until GATEWAY_CF_VERSION_UPLOAD_LIVE', () => {
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
  assert.ok(cfUpload?.run?.includes('publish-version-only'));
  assert.ok(wranglerUpload?.run?.includes('wrangler versions upload'));
  for (const upload of [cfUpload, wranglerUpload])
    assert.ok(upload.run.includes('GATEWAY_VERSION_ID=$version'));
  // One account source: the workflow-level CLOUDFLARE_ACCOUNT_ID.
  assert.equal(cfUpload.env.CLOUDFLARE_ACCOUNT_ID, undefined);
});

test('gateway traffic moves only through cf for either upload', () => {
  const workflow = readWorkflow('web-opennext.yaml');
  const steps = workflow.jobs.gateway.steps;
  const traffic = steps.filter((step) =>
    step.run?.includes('gateway-cf-publication.mjs serve ')
  );
  assert.equal(traffic.length, 1);
  assert.equal(traffic[0].if, undefined);
  assert.ok(traffic[0].run.includes('assert-current'));
  // Only the retryable exit code (75) repeats the request.
  assert.match(traffic[0].run, /test "\$status" -ne 75/);
  assert.match(traffic[0].run, /jq -er \.result\.versionId/);
  const jobText = JSON.stringify(steps);
  assert.doesNotMatch(
    jobText,
    /wrangler (versions deploy|deployments|rollback)/
  );
});

test('gateway helper-only changes trigger both gateway workflows', () => {
  const helpers = [
    'scripts/ci/gateway-cf-publication.mjs',
    'scripts/ci/gateway-cf-traffic.mjs',
    'scripts/ci/void-cf-publisher.mjs',
  ];
  const production = readWorkflow('web-opennext.yaml').on;
  const qualification = readWorkflow('gateway-cloudflare.yaml').on;
  for (const paths of [
    production.push.paths,
    qualification.push.paths,
    qualification.pull_request.paths,
  ])
    for (const helper of helpers) assert.ok(paths.includes(helper), helper);
});
