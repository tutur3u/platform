const assert = require('node:assert/strict');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

const workflows = readAllWorkflows(undefined, { raw: true });

// Repository secrets reach any workflow on any pushed branch, so each
// high-value secret may only flow into jobs whose branch-restricted
// environment holds its own copy. Adding a consumer means adding its
// environment here and to the secret's environment re-entry list.
const ALLOWED_ENVIRONMENTS = {
  PRODUCTION_SUPABASE_SECRET_KEY: [
    'cron-control-production',
    'devbox-control-production',
    'lettin-production',
    'meet-production',
  ],
  SUPABASE_ACCESS_TOKEN: [
    'supabase-production-migrations',
    'supabase-staging-migrations',
  ],
  PRODUCTION_DB_PASSWORD: ['supabase-production-migrations'],
  PRODUCTION_PROJECT_ID: ['supabase-production-migrations'],
  STAGING_DB_PASSWORD: ['supabase-staging-migrations'],
  STAGING_PROJECT_ID: ['supabase-staging-migrations'],
};

const environmentName = (job) =>
  typeof job.environment === 'object' ? job.environment?.name : job.environment;

for (const [secret, allowed] of Object.entries(ALLOWED_ENVIRONMENTS)) {
  const reference = new RegExp(`secrets\\.${secret}\\b`, 'u');

  test(`${secret} only reaches its branch-restricted environments`, () => {
    const consumers = [];
    for (const [file, workflow] of Object.entries(workflows)) {
      assert.doesNotMatch(
        JSON.stringify(workflow.env ?? {}),
        reference,
        `${file} must not expose ${secret} workflow-wide`
      );
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        if (!reference.test(JSON.stringify(job))) continue;
        consumers.push(`${file}:${jobName}`);
        assert.ok(
          allowed.includes(environmentName(job)),
          `${file}:${jobName} reads ${secret} outside ${allowed.join(', ')}`
        );
      }
    }
    assert.ok(consumers.length > 0, `expected a consumer of ${secret}`);
  });
}

test('pull-request builds and unit tests use a placeholder service-role key', () => {
  const unitTests = workflows['turbo-unit-tests.yaml'].jobs['test-shards'];
  assert.equal(unitTests.env.SUPABASE_SECRET_KEY, 'sb_secret_ci_placeholder');

  const build = workflows['external-internal-packages.yaml'].jobs.Build;
  for (const step of build.steps.filter((s) => s.env?.SUPABASE_SECRET_KEY)) {
    assert.doesNotMatch(step.env.SUPABASE_SECRET_KEY, /secrets\./u, step.name);
  }
});
