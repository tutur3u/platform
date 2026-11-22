const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const PARITY =
  'node scripts/ci/cf-worker-parity.mjs apps/cron-control scripts/ci/fixtures/cf-worker-parity/cron-control.json';

test('Cron Control qualifies its cf Build Output and deploys the same immutable artifact', () => {
  const workflow = readWorkflow('cron-control-cloudflare.yaml');
  const steps = workflow.jobs.validate.steps;
  const build = steps.findIndex(
    (step) =>
      step.uses === './.github/actions/run-with-turbo-remote-cache' &&
      step.with?.command ===
        'bun turbo:local run build --filter=@tuturuuu/cron-control --concurrency=2'
  );
  const parity = steps.findIndex((step) => step.run === PARITY);
  const emitted = steps.findIndex(
    (step) => step.env?.CRON_TEST_BUILD_OUTPUT === '1'
  );
  const dryRun = steps.findIndex((step) =>
    step.run?.startsWith('bun x --no-install cf deploy --prebuilt')
  );
  const upload = steps.findIndex((step) =>
    step.uses?.startsWith('actions/upload-artifact@')
  );
  assert.ok(build >= 0, 'build the Worker once');
  for (const [name, index] of Object.entries({ parity, emitted, dryRun }))
    assert.ok(
      index > build && upload > index,
      `${name} runs between build and upload`
    );
  assert.match(steps[dryRun].run, /--dry-run/);
  assert.match(steps[dryRun].run, /--no-provision/);
  assert.equal(
    steps[upload].with.name,
    'cron-control-worker-${{ github.sha }}'
  );
  assert.equal(
    steps[upload].with.path,
    '${{ runner.temp }}/cron-control-build-output'
  );

  assert.equal(
    workflow.jobs.deploy.if,
    "github.ref == 'refs/heads/production'"
  );
  const deployment = workflow.jobs.deploy.steps;
  const download = deployment.findIndex((step) =>
    step.uses?.startsWith('actions/download-artifact@')
  );
  const recheck = deployment.findIndex(
    (step) => step.run === `${PARITY} "$CLOUDFLARE_ACCOUNT_ID"`
  );
  const before = deployment.findIndex((step) =>
    step.run?.includes('cf-worker-settings.mjs before')
  );
  const lease = deployment.findIndex((step) => step.with?.phase === 'check');
  const reuse = deployment.findIndex((step) => step.id === 'already-serving');
  const publish = deployment.findIndex((step) =>
    step.run?.includes('cf deploy --prebuilt')
  );
  const after = deployment.findIndex((step) =>
    step.run?.includes('cf-worker-settings.mjs after')
  );
  const confirm = deployment.findIndex((step) =>
    step.run?.includes('verify-already-serving.mjs confirm')
  );
  const marker = deployment.findIndex((step) =>
    step.run?.includes('record-deployment-marker.ts')
  );
  assert.ok(download >= 0 && recheck > download && before > recheck);
  assert.ok(lease > before && reuse > lease && publish > reuse);
  assert.ok(after > publish && confirm > after && marker > confirm);
  const allowed = "steps.coordinator.outputs.publish != 'false'";
  assert.equal(deployment[reuse].if, undefined);
  assert.equal(
    deployment[reuse].env.CRON_COORDINATOR_PUBLISH,
    '${{ steps.coordinator.outputs.publish }}'
  );
  assert.match(deployment[reuse].run, /check .*settings-before\.json/);
  assert.equal(
    deployment[reuse].env.CRON_COORDINATOR_CHECK,
    '${{ steps.coordinator-lease.outcome }}'
  );
  assert.equal(
    deployment[publish].if,
    `${allowed} && steps.already-serving.outputs.reuse == 'false'`
  );
  assert.equal(deployment[after].if, allowed);
  assert.equal(deployment[publish].id, 'strict-publish');
  assert.equal(
    deployment[after].env.CRON_CONTROL_PUBLISH_OUTCOME,
    '${{ steps.strict-publish.outcome }}'
  );
  assert.match(deployment[after].run, /true:skipped\|false:success/);
  assert.equal(
    deployment[confirm].if,
    `${allowed} && steps.already-serving.outputs.reuse == 'true'`
  );
  assert.match(
    deployment[confirm].run,
    /confirm .*settings-before\.json.*settings-after\.json/
  );
  assert.equal(
    deployment[confirm].env.CRON_CONTROL_PROOF_DIGEST,
    '${{ steps.already-serving.outputs.proof-digest }}'
  );
  for (const index of [reuse, confirm]) {
    assert.equal(
      deployment[index].env.CRON_CONTROL_SERVING_PROOF,
      '${{ secrets.CRON_CONTROL_SERVING_PROOF }}'
    );
  }
  for (const index of [reuse, after, confirm]) {
    assert.equal(deployment[index]['continue-on-error'], undefined);
  }
  assert.equal(deployment[download].with.name, steps[upload].with.name);
  assert.equal(
    deployment[download].with.path,
    'apps/cron-control/.cloudflare/output'
  );
  assert.match(
    deployment[publish].run,
    /cf deploy --prebuilt --mode production --no-provision --message "\$GITHUB_SHA" --secrets-file "\$secrets_file"/
  );
  assert.equal(deployment[publish]['working-directory'], 'apps/cron-control');
  assert.ok(
    !deployment.some(
      (step) =>
        step.run === 'bun run build' ||
        /\bbun turbo:local run build\b/u.test(step.with?.command ?? '')
    ),
    'do not replace the tested artifact with a second build'
  );
});
