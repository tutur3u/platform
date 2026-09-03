const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('shared E2E avoids paused TanStack and Rust work', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '..', '.github', 'workflows', 'e2e-tests.yaml'),
    'utf8'
  );

  assert.match(workflow, /e2e-image-bundle\.js publish --frontend next/u);
  assert.match(
    workflow,
    /migration-e2e:\n(?:.|\n)*?\n {4}if: \$\{\{ false \}\}/u
  );
});
