const assert = require('node:assert/strict');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

const workflows = readAllWorkflows(undefined, { raw: true });
const PRODUCTION_SERVICE_KEY = /secrets\.PRODUCTION_SUPABASE_SECRET_KEY\b/u;
const PRODUCTION_REF_GATE = /github\.ref == 'refs\/heads\/production'/u;

// Repository secrets reach any workflow on any pushed branch, so the
// production service-role key may only flow into jobs that cannot run for a
// pull request: an environment-gated deploy or a production-ref release job.
test('production service-role key never reaches pull-request-reachable jobs', () => {
  const consumers = [];
  for (const [file, workflow] of Object.entries(workflows)) {
    const workflowEnv = JSON.stringify(workflow.env ?? {});
    assert.doesNotMatch(
      workflowEnv,
      PRODUCTION_SERVICE_KEY,
      `${file} must not expose the production service-role key workflow-wide`
    );
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      if (!PRODUCTION_SERVICE_KEY.test(JSON.stringify(job))) continue;
      consumers.push(`${file}:${jobName}`);
      assert.ok(
        job.environment || PRODUCTION_REF_GATE.test(String(job.if ?? '')),
        `${file}:${jobName} reads the production service-role key without an environment or production-ref gate`
      );
    }
  }
  assert.ok(consumers.length > 0, 'expected production deploy consumers');
});

test('pull-request builds and unit tests use a placeholder service-role key', () => {
  const unitTests = workflows['turbo-unit-tests.yaml'].jobs['test-shards'];
  assert.equal(unitTests.env.SUPABASE_SECRET_KEY, 'sb_secret_ci_placeholder');

  const build = workflows['external-internal-packages.yaml'].jobs.Build;
  for (const step of build.steps.filter((s) => s.env?.SUPABASE_SECRET_KEY)) {
    assert.doesNotMatch(step.env.SUPABASE_SECRET_KEY, /secrets\./u, step.name);
  }
});
