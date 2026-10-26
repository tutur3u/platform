const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  fixture,
  productionSha,
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
