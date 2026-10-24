// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub workflow expressions are literal inputs.
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
  const publish = deployment.findIndex((step) =>
    step.run?.includes('cf deploy --prebuilt')
  );
  assert.ok(download >= 0 && recheck > download && publish > recheck);
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
