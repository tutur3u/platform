// A failed-jobs-only or job-scoped rerun reruns consumers without rerunning their
// successful producers. Artifacts named by run attempt are then missing for the
// new attempt, so the rerun fails or validates stale inputs.
//
// Rather than parse every way a rerun can be spelled (continuations, folded
// YAML, flags in variables, gh aliases, REST or Octokit calls), any workflow
// that mentions a rerun must be listed here with the workflow it retries and the
// rerun mode it uses. A partial rerun may only target a workflow that does not
// hand artifacts between jobs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOWS = path.join(__dirname, '..', '..', '.github', 'workflows');

// Retrying workflow -> { target, mode }. Mode is 'partial' (failed or single
// jobs) or 'full' (the whole run).
const RERUN_TARGETS = {
  'release-please-transient-retry.yaml': {
    target: 'release-please.yaml',
    mode: 'partial',
  },
};

const RERUN_MENTION =
  /\brerun\b|re-?run-?failed-?jobs|re-?run-?(workflow|job)/i;
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

test('every workflow that mentions a rerun names its target and mode', () => {
  const requesting = workflowFiles().filter((name) =>
    RERUN_MENTION.test(uncommented(read(name)))
  );

  assert.deepEqual(
    requesting.sort(),
    Object.keys(RERUN_TARGETS).sort(),
    'List each workflow that reruns another run in RERUN_TARGETS with its target and mode'
  );
});

test('partial reruns only target workflows without artifact handoff', () => {
  for (const [retrier, { target, mode }] of Object.entries(RERUN_TARGETS)) {
    assert.ok(
      ['partial', 'full'].includes(mode),
      `${retrier} has unknown mode ${mode}`
    );
    assert.ok(
      workflowFiles().includes(target),
      `${retrier} targets missing workflow ${target}`
    );
    if (mode === 'partial') {
      assert.doesNotMatch(
        uncommented(read(target)),
        ARTIFACT_HANDOFF,
        `${target} passes artifacts between jobs, so ${retrier} must rerun the whole run`
      );
    }
  }
});

test('rerun mentions are detected in every spelling', () => {
  const spellings = [
    'gh run rerun "$RUN_ID" --failed',
    'gh run \\\n  rerun "$RUN_ID" --failed',
    'gh run rerun "$RUN_ID" --job "$JOB_ID"',
    'gh run rerun "$RUN_ID" $GH_RETRY_FLAGS',
    "gh alias set run-failed 'run rerun --failed'",
    'gh api -X POST repos/o/r/actions/runs/1/rerun-failed-jobs',
    'await github.rest.actions.reRunWorkflowFailedJobs({ run_id })',
    'await github.rest.actions.reRunJobForWorkflowRun({ job_id })',
  ];

  for (const spelling of spellings) {
    assert.match(uncommented(spelling), RERUN_MENTION, spelling);
  }
  assert.doesNotMatch(
    uncommented('# gh run rerun "$RUN_ID" --failed'),
    RERUN_MENTION
  );
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
