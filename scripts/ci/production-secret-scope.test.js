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
    'meet-cloudflare-production',
    'meet-production',
  ],
  SUPABASE_ACCESS_TOKEN: [
    'supabase-family-key',
    'supabase-production-migrations',
    'supabase-staging-migrations',
  ],
  // supabase-backup-*: the read-only backup export job
  // (supabase-backup-export.yaml). It has one job per target, each in a
  // main-only environment with a required reviewer, and each job reads only
  // its own project's secrets.
  PRODUCTION_DB_PASSWORD: [
    'supabase-backup-production',
    'supabase-production-migrations',
  ],
  PRODUCTION_PROJECT_ID: [
    'supabase-backup-production',
    'supabase-production-migrations',
  ],
  STAGING_DB_PASSWORD: [
    'supabase-backup-staging',
    'supabase-staging-migrations',
  ],
  STAGING_PROJECT_ID: [
    'supabase-backup-staging',
    'supabase-staging-migrations',
  ],
  RELEASE_PLEASE_TOKEN: ['release-please'],
};

const environmentName = (job) =>
  typeof job.environment === 'object' ? job.environment?.name : job.environment;

// A job may select its environment with an expression such as
// `${{ cond && 'a' || 'b' }}`; every literal it can resolve to must be allowed.
const environmentNames = (job) => {
  const name = environmentName(job);
  if (typeof name !== 'string') return [name];
  if (!name.includes('${{')) return [name];
  return [...name.matchAll(/(?:&&|\|\|)\s*'([^']+)'/gu)].map(
    (match) => match[1]
  );
};

// Returns the consumers of `secret` and every scope violation, so the rule
// can be checked against fixtures as well as the real workflows.
function checkSecretScope(allWorkflows, secret, allowed) {
  const reference = new RegExp(`secrets\\.${secret}\\b`, 'u');
  const consumers = [];
  const violations = [];
  for (const [file, workflow] of Object.entries(allWorkflows)) {
    if (reference.test(JSON.stringify(workflow.env ?? {}))) {
      violations.push(`${file} must not expose ${secret} workflow-wide`);
    }
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      if (!reference.test(JSON.stringify(job))) continue;
      consumers.push(`${file}:${jobName}`);
      const names = environmentNames(job);
      if (
        !(names.length > 0 && names.every((name) => allowed.includes(name)))
      ) {
        violations.push(
          `${file}:${jobName} reads ${secret} outside ${allowed.join(', ')}`
        );
      }
    }
  }
  return { consumers, violations };
}

for (const [secret, allowed] of Object.entries(ALLOWED_ENVIRONMENTS)) {
  test(`${secret} only reaches its branch-restricted environments`, () => {
    const { consumers, violations } = checkSecretScope(
      workflows,
      secret,
      allowed
    );
    assert.deepEqual(violations, []);
    assert.ok(consumers.length > 0, `expected a consumer of ${secret}`);
  });
}

test("a backup job may not read the other target's secrets", () => {
  const crossed = {
    'fixture.yaml': {
      jobs: {
        'export-staging': {
          environment: 'supabase-backup-staging',
          steps: [
            { env: { DB_PASSWORD: '${{ secrets.PRODUCTION_DB_PASSWORD }}' } },
          ],
        },
      },
    },
  };
  const { violations } = checkSecretScope(
    crossed,
    'PRODUCTION_DB_PASSWORD',
    ALLOWED_ENVIRONMENTS.PRODUCTION_DB_PASSWORD
  );
  assert.equal(violations.length, 1);
  assert.match(
    violations[0],
    /fixture\.yaml:export-staging reads PRODUCTION_DB_PASSWORD outside/u
  );
});

test('an expression that can resolve to an unlisted environment is rejected', () => {
  const selected = {
    'fixture.yaml': {
      jobs: {
        export: {
          environment:
            "${{ inputs.target == 'production' && 'supabase-backup-production' || 'supabase-backup-staging' }}",
          steps: [
            { env: { DB_PASSWORD: '${{ secrets.PRODUCTION_DB_PASSWORD }}' } },
          ],
        },
      },
    },
  };
  const { violations } = checkSecretScope(
    selected,
    'PRODUCTION_DB_PASSWORD',
    ALLOWED_ENVIRONMENTS.PRODUCTION_DB_PASSWORD
  );
  assert.equal(violations.length, 1);
  assert.match(
    violations[0],
    /fixture\.yaml:export reads PRODUCTION_DB_PASSWORD outside/u
  );
});

test('a job without an environment may not read a scoped secret', () => {
  const ungated = {
    'fixture.yaml': {
      jobs: {
        dump: { steps: [{ env: { P: '${{ secrets.STAGING_DB_PASSWORD }}' } }] },
      },
    },
  };
  const { violations } = checkSecretScope(
    ungated,
    'STAGING_DB_PASSWORD',
    ALLOWED_ENVIRONMENTS.STAGING_DB_PASSWORD
  );
  assert.equal(violations.length, 1);
  assert.match(
    violations[0],
    /fixture\.yaml:dump reads STAGING_DB_PASSWORD outside/u
  );
});

test('pull-request builds and unit tests use a placeholder service-role key', () => {
  const unitTests = workflows['turbo-unit-tests.yaml'].jobs['test-shards'];
  assert.equal(unitTests.env.SUPABASE_SECRET_KEY, 'sb_secret_ci_placeholder');

  const build = workflows['external-internal-packages.yaml'].jobs.Build;
  for (const step of build.steps.filter((s) => s.env?.SUPABASE_SECRET_KEY)) {
    assert.doesNotMatch(step.env.SUPABASE_SECRET_KEY, /secrets\./u, step.name);
  }
});
