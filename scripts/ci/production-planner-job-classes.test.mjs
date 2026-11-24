import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkProductionMigrationRecovery } from './check-production-migration-recovery.ts';
import {
  CRON_SERVING_PROOF_JOB,
  classifyPlannerJobs,
  heldAppSummary,
  plannerCaller,
  PLANNER_JOB_CLASSES,
} from './production-planner-job-classes.mjs';

const plannerSource = readFileSync(
  new URL('../../.github/workflows/vercel-production.yaml', import.meta.url),
  'utf8'
);
const moduleUrl = new URL(
  './production-planner-job-classes.mjs',
  import.meta.url
);

function jobs(overrides = {}, remove = []) {
  const base = {
    plan: 'success',
    'deploy-web-cloudflare / Verify-Production': 'success',
    'deploy-colab-cloudflare / deploy': 'success',
    'deploy-meet-cloudflare / validate': 'success',
    'deploy-meet-cloudflare / deploy': 'success',
    'deploy-parley-cloudflare / deploy': 'success',
    'deploy-mail-native': 'skipped',
    ...overrides,
  };
  for (const name of remove) delete base[name];
  return Object.entries(base).map(([name, conclusion], index) => ({
    id: index + 1,
    name,
    status: 'completed',
    conclusion,
  }));
}

const accepted = [
  ['all jobs succeed', 'success', jobs()],
  [
    'one independent app failed',
    'failure',
    jobs({ 'deploy-meet-cloudflare / deploy': 'failure' }),
  ],
  [
    'independent app validation failed and its deploy skipped',
    'failure',
    jobs({
      'deploy-parley-cloudflare / validate': 'failure',
      'deploy-parley-cloudflare / deploy': 'skipped',
    }),
  ],
  [
    'independent apps cancelled or timed out',
    'failure',
    jobs({
      'deploy-meet-cloudflare / deploy': 'cancelled',
      'deploy-parley-cloudflare / deploy': 'timed_out',
    }),
  ],
];
const rejected = [
  [
    'platform failed',
    'failure',
    jobs({ 'deploy-web-cloudflare / Verify-Production': 'failure' }),
  ],
  [
    'control plane failed',
    'failure',
    jobs({ 'deploy-colab-cloudflare / deploy': 'failure' }),
  ],
  ['plan failed', 'failure', jobs({ plan: 'failure' })],
  [
    'superseded planner completed successfully without a platform deploy',
    'success',
    jobs({ 'deploy-web-cloudflare / Verify-Production': 'skipped' }),
  ],
  [
    'platform cancelled',
    'failure',
    jobs({ 'deploy-web-cloudflare / Verify-Production': 'cancelled' }),
  ],
  [
    'platform skipped',
    'failure',
    jobs({
      'deploy-web-cloudflare / Verify-Production': 'skipped',
      'deploy-meet-cloudflare / deploy': 'failure',
    }),
  ],
  [
    'platform job missing',
    'failure',
    jobs({ 'deploy-meet-cloudflare / deploy': 'failure' }, [
      'deploy-web-cloudflare / Verify-Production',
    ]),
  ],
  [
    'plan job missing',
    'failure',
    jobs({ 'deploy-meet-cloudflare / deploy': 'failure' }, ['plan']),
  ],
  [
    'unknown caller',
    'failure',
    jobs({ 'deploy-surprise / deploy': 'failure' }),
  ],
  [
    'unknown caller that succeeded',
    'success',
    jobs({ 'deploy-surprise / deploy': 'success' }),
  ],
  [
    'renamed caller',
    'failure',
    jobs({ 'deploy-meet-cloudflare-v2 / deploy': 'failure' }),
  ],
  ['unparseable name', 'failure', jobs({ 'Deploy Meet': 'failure' })],
  [
    'unknown conclusion',
    'failure',
    jobs({ 'deploy-meet-cloudflare / deploy': 'action_required' }),
  ],
  [
    'null conclusion',
    'failure',
    jobs({ 'deploy-meet-cloudflare / deploy': null }),
  ],
  [
    'success planner with a failed app',
    'success',
    jobs({ 'deploy-meet-cloudflare / deploy': 'failure' }),
  ],
  ['failed planner with no failed job', 'failure', jobs()],
  ['cancelled planner', 'cancelled', jobs()],
  ['unfinished planner', null, jobs()],
  ['no jobs', 'failure', []],
  [
    'control plane neutral',
    'failure',
    jobs({
      'deploy-colab-cloudflare / deploy': 'neutral',
      'deploy-meet-cloudflare / deploy': 'failure',
    }),
  ],
];

test('every accepted planner shape is admitted', () => {
  for (const [label, conclusion, list] of accepted) {
    const result = classifyPlannerJobs(list, conclusion);
    assert.equal(result.ok, true, label);
  }
});

test('every unsafe planner shape fails closed', () => {
  for (const [label, conclusion, list] of rejected) {
    const result = classifyPlannerJobs(list, conclusion);
    assert.equal(result.ok, false, label);
    assert.deepEqual(result.held, [], label);
  }
});

test('non terminal and duplicate jobs fail closed', () => {
  const running = jobs({ 'deploy-meet-cloudflare / deploy': 'failure' });
  running[0].status = 'in_progress';
  assert.equal(classifyPlannerJobs(running, 'failure').ok, false);
  const duplicate = jobs({ 'deploy-meet-cloudflare / deploy': 'failure' });
  duplicate.push({ ...duplicate[0], id: 99 });
  assert.equal(classifyPlannerJobs(duplicate, 'failure').ok, false);
});

test('held apps list names, jobs and conclusions only', () => {
  const result = classifyPlannerJobs(
    jobs({
      'deploy-meet-cloudflare / deploy': 'failure',
      'deploy-parley-cloudflare / deploy': 'cancelled',
    }),
    'failure'
  );
  assert.deepEqual(
    result.held.map((entry) => entry.app),
    ['deploy-meet-cloudflare', 'deploy-parley-cloudflare']
  );
  const summary = heldAppSummary(result.held);
  assert.match(
    summary,
    /deploy-meet-cloudflare: deploy-meet-cloudflare \/ deploy failure/
  );
  assert.match(
    summary,
    /deploy-parley-cloudflare: deploy-parley-cloudflare \/ deploy cancelled/
  );
  assert.equal(summary.split('\n').length, 3);
});

test('caller ids parse bare skipped and nested job names', () => {
  assert.deepEqual(plannerCaller('deploy-ai'), {
    caller: 'deploy-ai',
    nested: null,
  });
  assert.deepEqual(
    plannerCaller('deploy-apps-native / native-profiles / build (production)'),
    {
      caller: 'deploy-apps-native',
      nested: 'native-profiles / build (production)',
    }
  );
  assert.equal(plannerCaller('Deploy-ai'), null);
  assert.equal(plannerCaller('deploy-ai /'), null);
});

test('class table lists exactly the planner caller jobs', () => {
  const callers = [...plannerSource.matchAll(/^ {2}([a-z0-9-]+):$/gm)]
    .map((match) => match[1])
    .filter((name) => name === 'plan' || name.startsWith('deploy-'));
  assert.deepEqual(Object.keys(PLANNER_JOB_CLASSES).sort(), callers.sort());
  assert.equal(
    PLANNER_JOB_CLASSES['deploy-web-cloudflare'],
    'platform-required'
  );
  assert.equal(PLANNER_JOB_CLASSES.plan, 'control-plane-required');
});

// Deliberate mutation negatives: each variant removes one gate and must let at
// least one of the unsafe shapes through, proving the table above detects it.
const mutations = [
  [
    'required failed gate removed',
    "if (kind !== INDEPENDENT_APP && !recoverable)\n      return reject('required-job-failed');",
  ],
  [
    'unclassified gate removed',
    "if (!kind) return reject('planner-job-unclassified');",
  ],
  [
    'required jobs gate removed',
    "return reject('required-job-missing-or-unsuccessful');",
  ],
  [
    'inconsistent conclusion gate removed',
    "return reject('planner-conclusion-inconsistent');",
  ],
];
for (const [label, line] of mutations) {
  test(`mutation negative: ${label}`, async () => {
    assert.ok(
      plannerSource.length > 0 &&
        readFileSync(moduleUrl, 'utf8').includes(line),
      label
    );
    const source = readFileSync(moduleUrl, 'utf8').replace(
      line,
      line.startsWith('if (') ? '' : 'void 0;'
    );
    const mutated = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    );
    const escaped = rejected.filter(
      ([, conclusion, list]) => mutated.classifyPlannerJobs(list, conclusion).ok
    );
    assert.ok(escaped.length > 0, `${label} escaped no unsafe shape`);
  });
}

const cronFailed = () =>
  jobs({
    'deploy-cron-control-cloudflare / validate': 'success',
    [CRON_SERVING_PROOF_JOB]: 'failure',
  });

test('a failed Cron Control deploy is required unless recovery is opted into', () => {
  assert.deepEqual(classifyPlannerJobs(cronFailed(), 'failure'), {
    ok: false,
    reason: 'required-job-failed',
    held: [],
  });
  assert.deepEqual(
    classifyPlannerJobs(cronFailed(), 'failure', { recoverableFailures: true }),
    {
      ok: true,
      reason: 'recoverable-control-plane-held',
      held: [
        {
          app: 'deploy-cron-control-cloudflare',
          jobs: [{ name: CRON_SERVING_PROOF_JOB, conclusion: 'failure' }],
        },
      ],
    }
  );
  // Only a truthy boolean opts in.
  assert.equal(
    classifyPlannerJobs(cronFailed(), 'failure', {
      recoverableFailures: 'true',
    }).ok,
    false
  );
});

test('recovery opt-in holds only a failed Cron Control deploy job', () => {
  for (const [label, overrides] of [
    ['cancelled Cron deploy', { [CRON_SERVING_PROOF_JOB]: 'cancelled' }],
    ['timed out Cron deploy', { [CRON_SERVING_PROOF_JOB]: 'timed_out' }],
    [
      'failed Cron validation',
      { 'deploy-cron-control-cloudflare / validate': 'failure' },
    ],
    ['failed Colab deploy', { 'deploy-colab-cloudflare / deploy': 'failure' }],
    ['failed plan', { plan: 'failure' }],
  ]) {
    const result = classifyPlannerJobs(jobs(overrides), 'failure', {
      recoverableFailures: true,
    });
    assert.equal(result.ok, false, label);
  }
  for (const [label, conclusion, list] of rejected) {
    const result = classifyPlannerJobs(list, conclusion, {
      recoverableFailures: true,
    });
    assert.equal(result.ok, false, `${label} with recovery opt-in`);
  }
});

// The marker producer classifies the planner first and then runs recovery on
// the same job inventory, so both modules must agree on a Cron-only failure.
function recoveryInput(failedStep, allow = true) {
  const sha = 'c'.repeat(40);
  const step = (name, conclusion) => ({
    name,
    status: 'completed',
    conclusion,
  });
  const list = [
    ['plan', 'success', [step('Resolve', 'success')]],
    [
      'deploy-web-cloudflare / Verify-Production',
      'success',
      [step('Record successful Cloudflare Web deployment marker', 'success')],
    ],
    [
      'deploy-cron-control-cloudflare / validate',
      'success',
      [step('Build', 'success')],
    ],
    [
      CRON_SERVING_PROOF_JOB,
      'failure',
      [step(failedStep, 'failure'), step('Publish', 'skipped')],
    ],
    ['deploy-mail-native', 'skipped', []],
  ].map(([name, conclusion, steps], index) => ({
    id: index + 1,
    run_id: 7,
    run_attempt: 1,
    head_sha: sha,
    head_branch: 'production',
    name,
    status: 'completed',
    conclusion,
    steps,
  }));
  return {
    jobs: list,
    recovery: {
      allow,
      eventName: 'workflow_dispatch',
      refName: 'production',
      expectedSha: sha,
      targetSha: sha,
      planner: {
        id: 7,
        run_attempt: 1,
        name: 'Production Deployment Planner',
        head_sha: sha,
        head_branch: 'production',
        status: 'completed',
        conclusion: 'failure',
      },
      jobPages: [{ total_count: list.length, jobs: list }],
    },
  };
}

test('classifier and recovery agree on a Cron serving-proof failure', () => {
  const canonical = recoveryInput(
    'Verify the prebuilt artifact is already serving'
  );
  assert.equal(
    classifyPlannerJobs(canonical.jobs, 'failure', {
      recoverableFailures: true,
    }).ok,
    true
  );
  assert.deepEqual(checkProductionMigrationRecovery(canonical.recovery), {
    allowed: true,
    reason: 'only_canonical_cloudflare_verification_failed',
  });

  // Without the opt-in both refuse.
  const closed = recoveryInput(
    'Verify the prebuilt artifact is already serving',
    false
  );
  assert.equal(classifyPlannerJobs(closed.jobs, 'failure').ok, false);
  assert.equal(
    checkProductionMigrationRecovery(closed.recovery).allowed,
    false
  );

  // The classifier holds the job, and recovery still rejects any other step.
  const publish = recoveryInput('Publish the exact artifact with its secrets');
  assert.equal(
    classifyPlannerJobs(publish.jobs, 'failure', { recoverableFailures: true })
      .ok,
    true
  );
  assert.deepEqual(checkProductionMigrationRecovery(publish.recovery), {
    allowed: false,
    reason: 'failure_outside_canonical_verification',
  });
});
