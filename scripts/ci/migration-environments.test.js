const assert = require('node:assert/strict');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

const workflows = readAllWorkflows(undefined, { raw: true });

// Migration credentials live in branch-restricted environments, not repository
// secrets. These names must differ from the supabase-staging and
// supabase-production deployment-marker environments, because a job
// environment creates deployments that would pollute the marker checks.
test('Supabase migration jobs read credentials from dedicated environments', () => {
  const staging = workflows['supabase-staging.yaml'].jobs.migrate;
  const production = workflows['supabase-production.yaml'].jobs.deploy;

  assert.equal(staging.environment, 'supabase-staging-migrations');
  assert.equal(production.environment, 'supabase-production-migrations');
});

test('package release tests never receive the production service-role key', () => {
  const releases = Object.entries(workflows).filter(([file]) =>
    /^release-.+-package\.yaml$/u.test(file)
  );
  assert.ok(releases.length >= 5);
  for (const [file, workflow] of releases) {
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      assert.doesNotMatch(
        JSON.stringify(job),
        /secrets\.PRODUCTION_SUPABASE_SECRET_KEY\b/u,
        `${file}:${jobName}`
      );
    }
  }
});
