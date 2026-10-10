// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub workflow expressions are literal inputs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('Cron Control qualifies emitted configuration and deploys the same immutable artifact', () => {
  const workflow = readWorkflow('cron-control-cloudflare.yaml');
  const steps = workflow.jobs.validate.steps;
  const build = steps.findIndex((step) => step.run === 'bun run build');
  const emitted = steps.findIndex((step) => step.env?.CRON_TEST_CONFIG);
  const upload = steps.findIndex((step) =>
    step.uses?.startsWith('actions/upload-artifact@')
  );
  assert.ok(build >= 0 && emitted > build && upload > emitted);
  assert.equal(
    steps[emitted].env.CRON_TEST_CONFIG,
    '${{ github.workspace }}/apps/cron-control/dist/worker/wrangler.json'
  );
  assert.equal(
    steps[upload].with.name,
    'cron-control-worker-${{ github.sha }}'
  );
  assert.equal(
    workflow.jobs.deploy.if,
    "github.ref == 'refs/heads/production'"
  );
  const deployment = workflow.jobs.deploy.steps;
  const download = deployment.findIndex((step) =>
    step.uses?.startsWith('actions/download-artifact@')
  );
  const deploy = deployment.findIndex((step) =>
    step.run?.includes('wrangler deploy')
  );
  assert.ok(download >= 0 && deploy > download);
  assert.equal(deployment[download].with.name, steps[upload].with.name);
  assert.match(deployment[deploy].run, /-c dist\/worker\/wrangler\.json/);
  assert.equal(
    deployment[deploy].working_directory ??
      deployment[deploy]['working-directory'],
    'apps/cron-control'
  );
  assert.ok(
    !deployment.some((step) => step.run === 'bun run build'),
    'do not replace the tested artifact with a second build'
  );
});
