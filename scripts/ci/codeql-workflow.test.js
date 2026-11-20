const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot } = require('./workflow-config-test-helpers.js');
const {
  context,
  queuedMainBaselines,
  render,
  workflows,
} = require('./protected-workflow-concurrency-helpers.js');

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

test('CodeQL main pushes coalesce without cancelling and pull requests still supersede', () => {
  const policy = workflows['codeql.yml'].concurrency;
  const first = {
    ...context('refs/heads/main', 'a'.repeat(40), 11),
    workflow: 'CodeQL Manual Fallback',
  };
  const second = {
    ...context('refs/heads/main', 'b'.repeat(40), 22),
    workflow: 'CodeQL Manual Fallback',
  };
  // The active scan finishes and a newer push replaces only the pending run;
  // the next scan diffs from the last successful push scan, so the replaced
  // commit is still analyzed (scripts/ci/codeql-push-scope.js).
  assert.equal(render(policy.group, first), render(policy.group, second));
  assert.equal(queuedMainBaselines.has('codeql.yml'), false);
  assert.equal(render(policy['cancel-in-progress'], first), false);
  assert.equal(render(policy['cancel-in-progress'], second), false);
  const pull = {
    ...context('refs/pull/7/merge', 'c'.repeat(40), 3, 'pull_request', 7),
    workflow: 'CodeQL Manual Fallback',
  };
  assert.equal(render(policy['cancel-in-progress'], pull), true);
  assert.notEqual(render(policy.group, pull), render(policy.group, first));
  // Reruns and dispatches keep their own immutable slot.
  const rerun = { ...first, run_attempt: 2 };
  assert.notEqual(render(policy.group, rerun), render(policy.group, first));
  assert.equal(render(policy['cancel-in-progress'], rerun), false);
  const dispatch = {
    ...context('refs/heads/main', 'c'.repeat(40), 33, 'workflow_dispatch'),
    workflow: 'CodeQL Manual Fallback',
  };
  assert.notEqual(render(policy.group, dispatch), render(policy.group, first));
});
