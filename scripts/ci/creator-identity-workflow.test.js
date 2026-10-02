const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper.js');

const creator = readWorkflow('creator-identity-contract.yaml');
const canonical = readWorkflow('rust-verify.yml');
const parity = creator.jobs['rust-profile-parity'];

test('creator Rust compilation retains the canonical bounded resource policy', () => {
  for (const name of ['CARGO_BUILD_JOBS', 'CARGO_PROFILE_TEST_DEBUG']) {
    assert.equal(parity.env[name], canonical.jobs.verify.env[name], name);
  }
  assert.equal(parity.env.CARGO_BUILD_JOBS, '2');
  assert.equal(parity.env.CARGO_PROFILE_TEST_DEBUG, '0');
});

test('resource bounds preserve full locked parity tests and read-only source validation', () => {
  assert.equal(parity['runs-on'], 'ubuntu-latest');
  assert.equal(parity['timeout-minutes'], 30);
  assert.deepEqual(creator.permissions, { contents: 'read' });
  assert.equal(parity.environment, undefined);
  const checkout = parity.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.match(
    checkout.with.ref,
    /^\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}$/
  );
  const commands = parity.steps.filter((step) => step.run);
  assert.equal(commands.length, 1);
  assert.equal(commands[0]['working-directory'], 'apps/backend');
  assert.equal(commands[0].run, 'cargo test --lib --locked');
  assert.equal(creator.jobs.contract['timeout-minutes'], 45);
  assert.ok(
    creator.jobs.contract.steps.some(
      (step) =>
        step.run ===
        'node apps/database/scripts/verify-creator-identity-contract.mjs'
    )
  );
});
