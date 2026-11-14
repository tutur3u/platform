const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  fixture,
  workflow,
  productionSha,
  stepScript,
} = require('./fixtures/production-migration-target-fixture.cjs');

const evaluateStep = 'Evaluate prerequisite status';
const failedPlanner = {
  PLANNER_RESULT: 'failure',
  PLATFORM_CALLER_CONCLUSION: 'failure',
};
const heldMeet = { 'deploy-meet-cloudflare / deploy': 'failure' };

function evaluate(t, overrides, extra = {}) {
  const setup = fixture(t, overrides);
  const summary = path.join(os.tmpdir(), `held-summary-${process.pid}-${Math.random()}`);
  t.after(() => fs.rmSync(summary, { force: true }));
  const result = setup.run(evaluateStep, {
    TARGET_SHA: productionSha,
    GITHUB_STEP_SUMMARY: summary,
    ...extra,
  });
  return {
    setup,
    result,
    summary: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '',
  };
}

test('all jobs successful admits and binds the planner attempt', (t) => {
  const { setup, result } = evaluate(t, {});
  assert.equal(result.status, 0);
  assert.match(setup.output(), /planner_run_id=301\nplanner_run_attempt=1\n/);
  assert.match(setup.output(), /should_deploy=true/);
});

test('one failed independent app is held while the migration proceeds', (t) => {
  const { setup, result, summary } = evaluate(t, {
    ...failedPlanner,
    PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet),
  });
  assert.equal(result.status, 0);
  assert.match(setup.output(), /should_deploy=true/);
  assert.match(
    result.stdout,
    /::warning::Held app deploy-meet-cloudflare: deploy-meet-cloudflare \/ deploy failure/
  );
  assert.match(summary, /deploy-meet-cloudflare \/ deploy failure/);
  assert.doesNotMatch(summary, /synthetic-test-only/);
});

test('more than one hundred planner jobs paginate to exhaustion', (t) => {
  const { setup, result } = evaluate(t, {
    ...failedPlanner,
    PLANNER_PAD_JOBS: '130',
    PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet),
  });
  assert.equal(result.status, 0);
  assert.match(setup.output(), /should_deploy=true/, result.stderr + result.stdout);
  assert.match(setup.requests(), /attempts\/1\/jobs\?per_page=100&page=2/);
});

const denied = [
  ['platform failed', { ...failedPlanner, PLANNER_JOB_OVERRIDES: JSON.stringify({ 'deploy-platform / Deploy-Production': 'failure' }) }, 'caller-deploy-job-contract'],
  ['control plane failed', { ...failedPlanner, PLANNER_JOB_OVERRIDES: JSON.stringify({ 'deploy-colab-cloudflare / deploy': 'failure' }) }, 'planner-jobs-required-job-failed'],
  ['unknown job name', { ...failedPlanner, PLANNER_JOB_OVERRIDES: JSON.stringify({ ...heldMeet, 'deploy-surprise / deploy': 'success' }) }, 'planner-jobs-planner-job-unclassified'],
  ['required platform job missing', { ...failedPlanner, PLANNER_JOB_OVERRIDES: JSON.stringify({ ...heldMeet, 'deploy-platform / Deploy-Production': '__remove__' }) }, 'caller-deploy-job-contract'],
  ['total_count above the returned jobs', { ...failedPlanner, PLANNER_TOTAL_COUNT_DELTA: '1', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'inventory-incomplete'],
  ['total_count below the returned jobs', { ...failedPlanner, PLANNER_TOTAL_COUNT_DELTA: '-1', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'inventory-incomplete'],
  ['duplicate job identity', { ...failedPlanner, PLANNER_DUPLICATE_JOB_ID: 'true', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'inventory-identity'],
  ['planner failed without a failed job', failedPlanner, 'planner-jobs-planner-failure-unexplained'],
  ['marker attempt older than the planner attempt', { ...failedPlanner, PLANNER_RUN_ATTEMPT: '2', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'planner-attempt-binding'],
  ['marker attempt newer than the planner attempt', { ...failedPlanner, PLATFORM_RUN_ATTEMPT: '2', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'planner-attempt-binding'],
  ['wrong repository id', { ...failedPlanner, PLATFORM_REPO_ID: '999', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'eligible-marker-missing'],
  ['wrong planner event', { ...failedPlanner, PLATFORM_CALLER_EVENT: 'pull_request', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'eligible-marker-missing'],
  ['wrong planner branch', { ...failedPlanner, PLATFORM_CALLER_BRANCH: 'main', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'eligible-marker-missing'],
  ['missing platform marker', { ...failedPlanner, PLATFORM_MARKER_MISSING: 'true', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'marker-inventory-source'],
  ['non-success marker status', { ...failedPlanner, PLATFORM_STATUS_STATE: 'failure', PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet) }, 'marker-latest-status'],
];
for (const [label, overrides, reason] of denied) {
  test(`planner admission fails closed: ${label}`, (t) => {
    const { setup, result } = evaluate(t, overrides);
    assert.equal(result.status, 0);
    assert.equal(setup.output(), 'should_deploy=false\n');
    assert.doesNotMatch(setup.output(), /planner_run_id/);
    assert.match(result.stderr, new RegExp(`Marker verification failed: ${reason}\\n`));
    assert.match(
      `${result.stdout}${result.stderr}`,
      /failed producer verification/
    );
  });
}

test('a cancelled planner is skipped before marker verification', (t) => {
  const { setup, result } = evaluate(t, {
    PLANNER_RESULT: 'cancelled',
    PLANNER_JOB_OVERRIDES: JSON.stringify(heldMeet),
  });
  assert.equal(result.status, 0);
  assert.equal(setup.output(), 'should_deploy=false\n');
  assert.match(result.stdout, /has conclusion 'cancelled'/);
});

// One shared predicate drives the job condition and the lock group.
function expressions() {
  const group = workflow.match(/^ {2}group: \$\{\{ (.*) \}\}$/m)?.[1];
  const admission = workflow.match(
    /name: Evaluate production prerequisites\n {4}if: \$\{\{ (.*) \}\}/
  )?.[1];
  assert.ok(group && admission);
  return { group, admission };
}
const LOCK = 'supabase-production-migration';
const run = (source, github) =>
  new vm.Script(source).runInNewContext(
    {
      github,
      format: (pattern, value) => pattern.replace('{0}', String(value)),
    },
    { timeout: 100 }
  );

function contexts() {
  const list = [];
  for (const event_name of ['workflow_dispatch', 'workflow_run', 'push'])
    for (const ref of ['refs/heads/production', 'refs/heads/main', 'refs/tags/production'])
      for (const name of ['Production Deployment Planner', 'Supabase Staging Migration', 'Other'])
        for (const conclusion of ['success', 'failure', 'cancelled', 'timed_out', 'skipped', 'neutral', null])
          for (const head_branch of ['production', 'main', 'other'])
            for (const event of ['push', 'workflow_run', 'workflow_dispatch', 'schedule'])
              for (const full_name of ['example/platform', 'fork/platform'])
                list.push({
                  event_name,
                  ref,
                  repository: 'example/platform',
                  run_id: 7,
                  event: {
                    workflow_run: {
                      name,
                      conclusion,
                      head_branch,
                      event,
                      head_repository: { full_name },
                    },
                  },
                });
  return list;
}

test('job condition and lock group are one predicate', () => {
  const { group, admission } = expressions();
  assert.equal(
    group,
    `(${admission}) && '${LOCK}' || format('${LOCK}-ignored-{0}', github.run_id)`
  );
  assert.match(workflow, /cancel-in-progress: false\n {2}queue: max/);
});

test('every apply-capable run resolves to the single lock group', () => {
  const { group, admission } = expressions();
  let admitted = 0;
  for (const github of contexts()) {
    const isAdmitted = run(admission, github);
    const lock = run(group, github);
    assert.equal(lock === LOCK, isAdmitted === true, JSON.stringify(github));
    if (!isAdmitted) assert.equal(lock, `${LOCK}-ignored-7`);
    if (isAdmitted) admitted += 1;
  }
  assert.ok(admitted > 0);
});

test('planner conclusions other than success or failure are never admitted', () => {
  const { admission } = expressions();
  for (const github of contexts()) {
    const planner = github.event.workflow_run.name === 'Production Deployment Planner';
    const conclusion = github.event.workflow_run.conclusion;
    if (
      github.event_name === 'workflow_run' &&
      planner &&
      conclusion !== 'success' &&
      conclusion !== 'failure'
    )
      assert.equal(run(admission, github), false, JSON.stringify(github));
    if (
      github.event_name === 'workflow_run' &&
      github.event.workflow_run.name === 'Supabase Staging Migration' &&
      conclusion !== 'success'
    )
      assert.equal(run(admission, github), false, JSON.stringify(github));
  }
});

// Deliberate mutation negatives: a relaxed condition with an unchanged group (or
// the reverse) must be caught by the parity check.
for (const [label, mutate] of [
  [
    'relaxed condition, group unchanged',
    ({ group, admission }) => ({
      group,
      admission: admission.replace(
        "(github.event.workflow_run.conclusion == 'success' || github.event.workflow_run.conclusion == 'failure')",
        'true'
      ),
    }),
  ],
  [
    'relaxed group, condition unchanged',
    ({ group, admission }) => ({
      group: group.replace(
        "(github.event.workflow_run.conclusion == 'success' || github.event.workflow_run.conclusion == 'failure')",
        'true'
      ),
      admission,
    }),
  ],
  [
    'condition accepts failure but the group keeps success only',
    ({ group, admission }) => ({
      group: group.replaceAll(
        "(github.event.workflow_run.conclusion == 'success' || github.event.workflow_run.conclusion == 'failure')",
        "github.event.workflow_run.conclusion == 'success'"
      ),
      admission,
    }),
  ],
]) {
  test(`parity mutation negative: ${label}`, () => {
    const original = expressions();
    const mutated = mutate(original);
    assert.notDeepEqual(mutated, original);
    const diverged = contexts().some(
      (github) =>
        (run(mutated.admission, github) === true) !==
        (run(mutated.group, github) === LOCK)
    );
    assert.ok(diverged, label);
  });
}

test('pre-apply guard re-reads the planner attempt before the apply step', () => {
  const guard = workflow.indexOf('Confirm planner attempt is still current before apply');
  const apply = workflow.indexOf('      - name: Deploy migrations to production');
  assert.ok(guard > 0 && guard < apply);
  const script = stepScript('Confirm planner attempt is still current before apply');
  assert.match(script, /actions\/runs\/\$PLANNER_RUN_ID/);
  assert.match(script, /"\$ATTEMPT" != "\$PLANNER_RUN_ATTEMPT"/);
  assert.match(script, /\.github\/workflows\/vercel-production\.yaml/);
});
