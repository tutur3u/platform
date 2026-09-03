const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertWorkflowDecision,
  createFixtureRoot,
} = require('./workflow-config-test-helpers.js');

test('paused TanStack and Rust workflows remain disabled', () => {
  const rootDir = createFixtureRoot();

  for (const [workflowName, changedFiles] of [
    ['rust-backend.yml', ['apps/backend/src/main.rs']],
    [
      'vercel-production-tanstack-web.yaml',
      ['apps/tanstack-web/src/routes/index.tsx'],
    ],
  ]) {
    const decision = assertWorkflowDecision(
      { changedFiles, rootDir, workflowName },
      false
    );

    assert.match(decision.output, /disabled in tuturuuu\.ts/);
  }
});
