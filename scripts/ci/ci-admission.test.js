const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { admissionDecision, main } = require('./ci-admission');
const { READY_LABEL } = require('./pr-label-gate');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflow = readWorkflow('ci-admitted.yaml', { raw: true });
const job = workflow.jobs.admitted;

test('admission is red without the label and on a push/label race', () => {
  const decide = (payloadLabels, currentLabels) =>
    admissionDecision({ payloadLabels, currentLabels });
  assert.equal(decide([], []).reason, 'missing');
  assert.equal(decide(['WIP'], ['WIP']).admitted, false);
  // Label removed after the event: the PR is no longer admitted.
  assert.equal(decide([READY_LABEL], []).reason, 'missing');
  // Label added after the event: this event's heavy runs were skipped.
  const race = decide([], [READY_LABEL]);
  assert.equal(race.admitted, false);
  assert.equal(race.reason, 'race');
  assert.match(race.message, /re-add/u);
  assert.equal(decide([READY_LABEL], [READY_LABEL, 'WIP']).admitted, true);
});

test('the CLI fails the check unless admitted and reports why', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-admission-'));
  try {
    const run = (payload, current) => {
      const file = path.join(dir, 'labels.json');
      const summary = path.join(dir, 'summary.md');
      fs.writeFileSync(file, JSON.stringify(current));
      fs.writeFileSync(summary, '');
      const log = console.log;
      console.log = () => {};
      try {
        const code = main({
          PAYLOAD_LABELS: JSON.stringify(payload),
          CURRENT_LABELS_FILE: file,
          GITHUB_STEP_SUMMARY: summary,
        });
        return { code, summary: fs.readFileSync(summary, 'utf8') };
      } finally {
        console.log = log;
      }
    };
    assert.equal(run([READY_LABEL], [READY_LABEL]).code, 0);
    const missing = run([], []);
    assert.equal(missing.code, 1);
    assert.match(missing.summary, /not admitted/u);
    assert.equal(run([], [READY_LABEL]).code, 1);
    assert.throws(() =>
      main({ PAYLOAD_LABELS: '{"a":1}', CURRENT_LABELS_FILE: __filename })
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CI Admitted is always on, read-only and immune to PR edits', () => {
  assert.deepEqual(workflow.on, {
    pull_request: {
      types: [
        'opened',
        'synchronize',
        'reopened',
        'ready_for_review',
        'labeled',
        'unlabeled',
      ],
    },
  });
  // Always on: no job gate and no switchboard that could skip it.
  assert.deepEqual(Object.keys(workflow.jobs), ['admitted']);
  assert.equal(job.if, undefined);
  assert.equal(job.needs, undefined);
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(job.permissions, {
    contents: 'read',
    issues: 'read',
    'pull-requests': 'read',
  });
  assert.ok(job['timeout-minutes'] <= 5);
  const checkout = job.steps[0];
  assert.match(checkout.uses, /^actions\/checkout@[0-9a-f]{40}$/u);
  // The script comes from the base commit, never the pull request head.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
  assert.equal(checkout.with.ref, '${{ github.event.pull_request.base.sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  for (const step of job.steps.slice(1)) {
    assert.doesNotMatch(step.run, /\$\{\{/u, 'inputs pass through env only');
  }
  assert.match(job.steps[1].run, /issues\/\$PR_NUMBER\/labels/u);
  assert.match(job.steps[2].run, /node scripts\/ci\/ci-admission\.js/u);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  assert.match(workflow.concurrency.group, /pull_request\.number/u);
});
