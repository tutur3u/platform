const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const {
  fixture,
  productionSha,
  workflow,
  workflowSha,
} = require('./fixtures/production-migration-target-fixture.cjs');
const step = 'Evaluate prerequisite status';
const currentPush = {
  TARGET_CONTRACT: 'new',
  WRAPPER_CONTRACT: 'new',
  STAGING_RUN_EVENT: 'push',
  FIXTURE_WRAPPER_SHA: productionSha,
};
function execute(t, overrides = {}) {
  const setup = fixture(t, { ...currentPush, ...overrides });
  return { setup, result: setup.run(step, { TARGET_SHA: productionSha }) };
}

test('production accepts the new staging producer only for an exact-target push', (t) => {
  const { setup, result } = execute(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(setup.output(), /should_deploy=true/u);
  assert.doesNotMatch(setup.requests(), /FETCH_FIXTURE_UNEXPECTED/u);
});
for (const [name, overrides] of [
  ['push head differs from target', { FIXTURE_WRAPPER_SHA: workflowSha }],
  ['new contract manual dispatch', { STAGING_RUN_EVENT: 'workflow_dispatch' }],
  ['new contract workflow wrapper', { STAGING_RUN_EVENT: 'workflow_run' }],
  [
    'legacy contract direct push',
    { TARGET_CONTRACT: 'previous', WRAPPER_CONTRACT: 'previous' },
  ],
  [
    'legacy earliest contract direct push',
    { TARGET_CONTRACT: 'old', WRAPPER_CONTRACT: 'old' },
  ],
  ['unknown target contract', { TARGET_CONTRACT: 'unknown' }],
  [
    'unknown producer contract',
    { WRAPPER_CONTRACT: 'unknown', FIXTURE_WRAPPER_SHA: workflowSha },
  ],
])
  test(`production rejects ${name}`, (t) => {
    const { setup, result } = execute(t, overrides);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(setup.output(), /should_deploy=true/u);
  });
for (const kind of ['previous', 'old'])
  test(`production retains ${kind} staging wrapper and dispatch evidence`, (t) => {
    for (const event of ['workflow_run', 'workflow_dispatch']) {
      const { setup, result } = execute(t, {
        TARGET_CONTRACT: kind,
        WRAPPER_CONTRACT: kind,
        STAGING_RUN_EVENT: event,
        FIXTURE_WRAPPER_SHA:
          event === 'workflow_dispatch' ? productionSha : workflowSha,
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(setup.output(), /should_deploy=true/u);
      assert.doesNotMatch(setup.requests(), /FETCH_FIXTURE_UNEXPECTED/u);
    }
  });

for (const kind of ['previous', 'old']) {
  const mismatchedDispatch = {
    TARGET_CONTRACT: kind,
    WRAPPER_CONTRACT: kind,
    STAGING_RUN_EVENT: 'workflow_dispatch',
    FIXTURE_WRAPPER_SHA: workflowSha,
  };
  test(`production rejects ${kind} dispatch with a different head before reading contracts`, (t) => {
    const { setup, result } = execute(t, mismatchedDispatch);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(setup.output(), /should_deploy=true/u);
    assert.doesNotMatch(setup.requests(), /FETCH_FIXTURE_UNEXPECTED/u);
    assert.doesNotMatch(setup.requests(), /FETCH .*\/contents\//u);
  });
}

test('producer validation rejects manual dispatch with a different head', () => {
  // Exercise checkRun independently: latestMarker normally rejects this first.
  const proof = workflow.split("<<'STAGING_SOURCE_PROOF'\n")[1];
  const startMain = proof.indexOf('          main().catch(');
  assert.ok(startMain > 0, 'inline source verifier entry point exists');
  const checkRun = runInNewContext(
    `${proof.slice(0, startMain)}\ncheckRun`,
    {
      process: {
        env: {
          GITHUB_REPOSITORY: 'example/platform',
          TARGET_SHA: productionSha,
        },
      },
    },
    { timeout: 1000 }
  );
  const repository = { id: 101, full_name: 'example/platform' };
  const run = {
    id: 201,
    workflow_id: 102,
    path: '.github/workflows/supabase-staging.yaml',
    head_branch: 'main',
    head_sha: workflowSha,
    event: 'workflow_dispatch',
    repository,
    head_repository: repository,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
  };
  const payload = { runId: '201', runAttempt: '1' };
  const producerWorkflow = { id: 102 };
  assert.throws(
    () => checkRun(run, payload, repository, producerWorkflow),
    /direct-source/u
  );
  assert.doesNotThrow(() =>
    checkRun(
      { ...run, head_sha: productionSha },
      payload,
      repository,
      producerWorkflow
    )
  );
});

test('a newer failed push marker prevents fallback to an older successful push', (t) => {
  const { setup, result } = execute(t, { STAGING_LATER_PUSH: 'true' });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(setup.output(), /should_deploy=true/u);
  assert.doesNotMatch(setup.requests(), /FETCH_FIXTURE_UNEXPECTED/u);
  assert.match(setup.requests(), /FETCH .*actions\/runs\/202\n/u);
  assert.doesNotMatch(setup.requests(), /FETCH .*actions\/runs\/201/u);
});
