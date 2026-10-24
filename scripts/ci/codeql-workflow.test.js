const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot } = require('./workflow-config-test-helpers.js');

test('checked-in CodeQL is the only CodeQL configuration and scans every change', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'codeql.yml'),
    'utf8'
  );

  // Default setup is not configured; this workflow owns PR, push and the daily
  // scheduled scan (scheduled through security-checks.yaml, the only timer).
  assert.match(workflow, /\n {2}workflow_dispatch:\n/);
  assert.match(workflow, /\n {2}pull_request:\n/);
  assert.match(workflow, /\n {2}push:\n {4}branches:\n {6}- main\n/);
  assert.match(workflow, /\n {2}workflow_call:\n/);
  assert.doesNotMatch(workflow, /\n {2}schedule:/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.match(workflow, /queries: security-extended/);
  // No ci-check switchboard: its selectors run from the PR checkout and could
  // skip the scan (REV-6456-9); the scope job uses base-commit selectors.
  assert.doesNotMatch(workflow, /^ {2}check-ci:/m);
  assert.doesNotMatch(workflow, /ci-check\.yml/);
  assert.match(
    workflow,
    /node "\$gate" "\$RUNNER_TEMP\/codeql-sarif" "\$CATEGORY"/
  );

  const config = fs.readFileSync(path.join(repoRoot, 'tuturuuu.ts'), 'utf8');
  assert.doesNotMatch(config, /['"]codeql\.yml['"]\s*:/);
  const switchboard = fs.readFileSync(
    path.join(repoRoot, 'tuturuuu.ci.ts'),
    'utf8'
  );
  assert.doesNotMatch(switchboard, /'codeql\.yml'/);
  assert.doesNotMatch(switchboard, /'security-checks\.yaml'/);
});
