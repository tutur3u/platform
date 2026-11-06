const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  fixture,
  productionSha,
} = require('./fixtures/production-migration-target-fixture.cjs');
function execute(t, overrides = {}) {
  const setup = fixture(t, {
    TARGET_CONTRACT: 'new',
    WRAPPER_CONTRACT: 'new',
    STAGING_RUN_EVENT: 'push',
    FIXTURE_WRAPPER_SHA: productionSha,
    STAGING_LATER_MANUAL: 'true',
    ...overrides,
  });
  const result = setup.run('Evaluate prerequisite status', {
    TARGET_SHA: productionSha,
  });
  assert.doesNotMatch(setup.requests(), /FETCH_FIXTURE_UNEXPECTED/u);
  return { setup, result };
}
test('a later staging-only manual marker does not block an earlier eligible push marker', (t) => {
  const { setup, result } = execute(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(setup.output(), /should_deploy=true/u);
  assert.match(setup.requests(), /actions\/runs\/201\/attempts\/1\/jobs/u);
  assert.doesNotMatch(setup.requests(), /actions\/runs\/202\/attempts/u);
  assert.equal(
    setup
      .requests()
      .split('\n')
      .filter((s) => s === 'FETCH /repos/example/platform/actions/runs/202')
      .length,
    2
  );
});
for (const [name, overrides] of [
  ['rerun attempt', { MANUAL_ATTEMPT: '2' }],
  [
    'in-progress rerun',
    { MANUAL_ATTEMPT: '2', MANUAL_STATUS: 'in_progress', MANUAL_RESULT: '' },
  ],
  ['failed manual run', { MANUAL_RESULT: 'failure' }],
])
  test(`staging-only manual ${name} cannot displace push evidence`, (t) => {
    const { setup, result } = execute(t, overrides);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(setup.output(), /should_deploy=true/u);
  });
for (const [name, overrides] of [
  ['wrong manual repository', { MANUAL_WRONG_REPOSITORY: 'true' }],
  ['changed manual classification', { MANUAL_RECLASSIFIED: 'true' }],
  ['failed selected push', { STAGING_RESULT: 'failure' }],
  ['unfinished selected push', { STAGING_STATUS: 'in_progress' }],
])
  test(`eligible-marker selection fails closed for ${name}`, (t) => {
    const { setup, result } = execute(t, overrides);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(setup.output(), /should_deploy=true/u);
  });
