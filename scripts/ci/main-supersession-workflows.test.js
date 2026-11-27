const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  context,
  events,
  mainSupersession,
  render,
  workflows,
} = require('./protected-workflow-concurrency-helpers');

const workflowRoot = path.resolve(__dirname, '../../.github/workflows');

// Pure CI checks in scripts/ci/main-supersession.json: a newer main push
// cancels the older run, while production, generated release branches,
// reruns and dispatches (release-candidate evidence) keep their own runs.
test('listed main CI supersedes on main and keeps every evidence run', () => {
  assert.equal(mainSupersession.includes('turbo-unit-tests.yaml'), false);
  assert.equal(mainSupersession.includes('type-check.yaml'), false);
  for (const file of mainSupersession) {
    const workflow = workflows[file];
    assert.ok(workflow, file);
    const { group, 'cancel-in-progress': cancel } = workflow.concurrency;
    const first = { ...context('refs/heads/main'), workflow: workflow.name };
    const later = { ...first, sha: 'later', run_id: 2 };
    assert.equal(render(group, first), render(group, later), file);
    assert.equal(render(cancel, later), true, file);
    for (const ref of [
      'refs/heads/production',
      'refs/heads/release-please--branches--production',
    ]) {
      const kept = { ...first, ref };
      assert.equal(render(cancel, kept), false, file);
      assert.notEqual(
        render(group, kept),
        render(group, { ...kept, sha: 'later', run_id: 2 }),
        file
      );
    }
    assert.ok(
      Object.hasOwn(events(workflow), 'workflow_dispatch'),
      `${file} needs workflow_dispatch for release-candidate evidence`
    );
    for (const extra of [
      {
        ref: 'refs/heads/release-candidate/abc',
        event_name: 'workflow_dispatch',
      },
      { event_name: 'workflow_dispatch' },
      { run_attempt: 2 },
    ]) {
      const kept = { ...first, ...extra };
      assert.equal(
        render(cancel, kept),
        false,
        `${file} ${JSON.stringify(extra)}`
      );
      assert.notEqual(render(group, kept), render(group, later), file);
    }
  }
});

// A workflow that writes or holds a GitHub Environment never supersedes.
test('main supersession lists no workflow that writes or holds an environment', () => {
  for (const file of mainSupersession) {
    const source = fs.readFileSync(path.join(workflowRoot, file), 'utf8');
    assert.doesNotMatch(source, /^\s+environment:/m, file);
    assert.doesNotMatch(source, /:\s*write\b/, file);
  }
});
