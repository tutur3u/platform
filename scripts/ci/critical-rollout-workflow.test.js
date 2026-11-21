const test = require('node:test');
const assert = require('node:assert/strict');
const { readWorkflow } = require('./workflow-yaml-test-helper.js');

test('the Cloudflare Web producer records a marker only after authenticated serving proof', () => {
  const workflow = readWorkflow('web-cloudflare-production.yaml');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_call']);
  const job = workflow.jobs['Verify-Production'];
  assert.equal(job.if, "github.ref == 'refs/heads/production'");
  assert.deepEqual(job.permissions, { contents: 'read', deployments: 'write' });
  const proof = job.steps.findIndex(
    ({ run }) => run === 'node scripts/ci/verify-cloudflare-web-production.mjs'
  );
  const marker = job.steps.findIndex(
    ({ name }) => name === 'Record successful Cloudflare Web deployment marker'
  );
  assert.ok(proof >= 0 && marker > proof);
  assert.equal(job.steps[proof]['continue-on-error'], undefined);
  assert.match(job.steps[proof].env.CLOUDFLARE_API_TOKEN, /^\$\{\{ secrets\./);
  assert.equal(job.steps[marker].if, undefined);
  assert.equal(job.steps[marker].env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(
    job.steps[marker].env.DEPLOYMENT_MARKER_ENVIRONMENT,
    'cloudflare-production-web'
  );
  assert.equal(
    job.steps[marker].env.DEPLOYMENT_MARKER_SHA,
    job.steps[proof].env.TARGET_SHA
  );
  assert.equal(job.steps[marker].env.GITHUB_TOKEN, '$' + '{{ github.token }}');
});
