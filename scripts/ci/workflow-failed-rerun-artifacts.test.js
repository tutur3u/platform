// A failed-jobs-only rerun (`gh run rerun --failed`) reruns consumers without
// rerunning their successful producers. Artifacts named by run attempt are then
// missing for the new attempt, so the rerun fails or validates stale inputs.
// Every workflow that requests a failed-only rerun must name the workflow it
// retries here, and that target must not pass artifacts between jobs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOWS = path.join(__dirname, '..', '..', '.github', 'workflows');

// Retrying workflow -> the workflow file whose failed jobs it reruns.
const FAILED_RERUN_TARGETS = {
  'release-please-transient-retry.yaml': 'release-please.yaml',
};

const FAILED_RERUN =
  /gh\s+run\s+rerun\b[^\n]*--failed|rerun-failed-jobs|reRunWorkflowFailedJobs/;
const ARTIFACT_HANDOFF = /actions\/(upload|download)-artifact@/;

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'));
}

function read(name) {
  return fs.readFileSync(path.join(WORKFLOWS, name), 'utf8');
}

function uncommented(source) {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

test('every failed-only rerun names its target workflow', () => {
  const requesting = workflowFiles().filter((name) =>
    FAILED_RERUN.test(uncommented(read(name)))
  );

  assert.deepEqual(
    requesting.sort(),
    Object.keys(FAILED_RERUN_TARGETS).sort(),
    'Map each workflow that reruns failed jobs to its target in FAILED_RERUN_TARGETS'
  );
});

test('failed-only rerun targets do not hand artifacts between jobs', () => {
  for (const [retrier, target] of Object.entries(FAILED_RERUN_TARGETS)) {
    assert.ok(
      workflowFiles().includes(target),
      `${retrier} targets missing workflow ${target}`
    );
    assert.doesNotMatch(
      uncommented(read(target)),
      ARTIFACT_HANDOFF,
      `${target} passes artifacts between jobs, so ${retrier} must rerun the whole run instead of --failed`
    );
  }
});

test('the artifact check recognises an artifact producer and ignores comments', () => {
  const producer = [
    '      - uses: actions/upload-artifact@0123456789abcdef0123456789abcdef01234567 # v4',
    '        with:',
    '          path: dist',
  ].join('\n');

  assert.match(uncommented(producer), ARTIFACT_HANDOFF);
  assert.doesNotMatch(uncommented(`# ${producer.trim()}`), ARTIFACT_HANDOFF);
});
