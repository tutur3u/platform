const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const GUARD = "steps.no-downgrade.outputs.deploy == 'true'";

test('gateway upload stays Wrangler until GATEWAY_CF_VERSION_UPLOAD_LIVE', () => {
  const workflow = readWorkflow('web-opennext.yaml');
  const steps = workflow.jobs.gateway.steps;
  const cfUpload = steps.find(
    (step) =>
      step.name?.includes('cf prebuilt') &&
      step.if === `${GUARD} && vars.GATEWAY_CF_VERSION_UPLOAD_LIVE == 'true'`
  );
  const wranglerUpload = steps.find(
    (step) =>
      step.name?.includes('Wrangler publisher fallback') &&
      step.if === `${GUARD} && vars.GATEWAY_CF_VERSION_UPLOAD_LIVE != 'true'`
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
  // CI never moves gateway traffic unless the cf flag is explicitly set.
  assert.equal(
    traffic[0].if,
    `${GUARD} && vars.GATEWAY_CF_VERSION_UPLOAD_LIVE == 'true'`
  );
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

test('the no-downgrade guard runs after capture and gates every write', () => {
  const workflow = readWorkflow('web-opennext.yaml');
  const steps = workflow.jobs.gateway.steps;
  const index = (predicate) => steps.findIndex(predicate);
  const capture = index((step) =>
    step.run?.includes('gateway-deploy-config.mjs capture')
  );
  const guard = index((step) => step.id === 'no-downgrade');
  assert.ok(capture >= 0 && guard === capture + 1);
  const step = steps[guard];
  assert.equal(step.if, undefined);
  assert.match(
    step.run,
    /gateway-no-downgrade\.mjs "\$RUNNER_TEMP\/gateway-settings\.json"/
  );
  assert.equal(step.env.TARGET_SHA, '${{ github.sha }}');
  assert.equal(step.env.GITHUB_TOKEN, '${{ github.token }}');
  // Forcing an unparseable message needs an explicit workflow_dispatch input.
  assert.match(
    step.env.GATEWAY_FORCE_UNPARSEABLE,
    /github\.event_name == 'workflow_dispatch' && inputs\['gateway-force-unparseable'\]/
  );
  const force =
    workflow.on.workflow_dispatch.inputs['gateway-force-unparseable'];
  assert.equal(force.type, 'boolean');
  assert.equal(force.default, false);

  const writes = steps
    .map((s, i) => ({ s, i }))
    .filter(
      ({ s }) =>
        s.run?.includes('publish-version-only') ||
        s.run?.includes('wrangler versions upload') ||
        s.run?.includes('gateway-cf-publication.mjs serve ')
    );
  assert.equal(writes.length, 3);
  for (const { s, i } of writes) {
    assert.ok(i > guard, s.name);
    assert.ok(s.if?.startsWith(`${GUARD} && `), s.name);
    // Existing preimage assertions stay in place.
    assert.ok(s.run.includes('assert-current'), s.name);
  }
  const unit = steps.find((s) =>
    s.run?.includes('gateway-no-downgrade.test.mjs')
  );
  assert.ok(steps.indexOf(unit) < guard);
  assert.ok(
    workflow.on.push.paths.includes('scripts/ci/gateway-no-downgrade.mjs')
  );
});
