import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  evaluateDispatchGate,
  evaluateIntake,
  extractCandidates,
  isIntakeBlocked,
  parseIsoWithZone,
  runCli,
} from './perf-dispatch-gate.mjs';

const F431_MIRROR = {
  taskKey: 'perf-roadmap-error_rate-2026-11-21t033000000z',
  stage: 'verify-post-deploy',
  regression: {
    id: 'perf-roadmap-error_rate-2026-11-21T033000000Z',
    app: 'roadmap',
    metric: 'error_rate',
  },
  subscription: {
    stage: 'verify-post-deploy',
    readyAfter: '2026-11-21T10:45:00Z',
    verificationBlocker: {
      reason: 'p95 not evaluable: below 50 filtered requests',
    },
  },
  verification: {
    verdict: 'blocked',
    blocker: 'p95 not evaluable: below 50 filtered requests',
  },
};

const F431_BOARD_TASK = {
  ...F431_MIRROR,
  list: 'Live Today',
};

const FORMS_TASK = {
  taskKey: 'perf-forms-p95_ttfb_ms-2026-11-27t120000000z',
  stage: 'investigate',
  list: 'Live Today',
  regression: {
    id: 'perf-forms-p95_ttfb_ms-2026-11-27T120000000Z',
    app: 'forms',
    metric: 'p95_ttfb_ms',
  },
};

const DEPLOY_TASK = {
  taskKey: 'perf-production-deploy-46017368001',
  stage: 'deployment-triage',
  type: 'production_deploy_failure',
  list: 'Needs User / Review',
  productionFailure: { id: 'perf-deploy-failure-46017368001' },
};

test('extractCandidates keeps only open regression tasks with ready list and skips mirrors without list', () => {
  const { candidates, skipped } = extractCandidates([
    F431_BOARD_TASK,
    F431_MIRROR,
    DEPLOY_TASK,
    { ...FORMS_TASK, list: 'Done' },
    { ...FORMS_TASK, taskKey: 'human-wait', stage: 'human-approval' },
  ]);
  assert.deepEqual(candidates, [
    {
      id: F431_BOARD_TASK.regression.id,
      app: 'roadmap',
      metric: 'error_rate',
      state: 'ready',
      taskKey: F431_BOARD_TASK.taskKey,
    },
  ]);
  assert.deepEqual(
    skipped.map((entry) => entry.reason),
    [
      'missing_list',
      'non_regression',
      'list_not_ready',
      'stage_not_dispatchable',
    ]
  );
});

test('mirror-shaped task without list fails closed and never dispatches', () => {
  const mirrorNoList = {
    taskKey: FORMS_TASK.taskKey,
    stage: 'investigate',
    regression: FORMS_TASK.regression,
  };
  const result = evaluateDispatchGate({
    tasks: [mirrorNoList],
    detection: {
      generatedAt: '2026-11-28T00:00:00Z',
      candidates: [
        {
          id: FORMS_TASK.regression.id,
          app: 'forms',
          metric: 'p95_ttfb_ms',
          state: 'ready',
          observedRequests: 90,
          minRequests: 50,
          transition: false,
        },
      ],
    },
  });
  assert.equal(result.degraded, false);
  assert.deepEqual(result.dispatchable, []);
  assert.deepEqual(result.skipped, [
    { taskKey: FORMS_TASK.taskKey, reason: 'missing_list' },
  ]);
});

test('honors stored verification blocker even when window reaches 50 requests', () => {
  const result = evaluateDispatchGate({
    tasks: [F431_BOARD_TASK],
    detection: {
      generatedAt: '2026-11-28T00:00:00Z',
      candidates: [
        {
          id: F431_BOARD_TASK.regression.id,
          app: 'roadmap',
          metric: 'error_rate',
          state: 'ready',
          observedRequests: 80,
          minRequests: 50,
          transition: true,
        },
      ],
    },
  });
  assert.equal(result.degraded, false);
  assert.deepEqual(result.dispatchable, []);
  assert.deepEqual(result.skipped, [
    { taskKey: F431_BOARD_TASK.taskKey, reason: 'verification_blocked' },
  ]);
});

test('enforces verify-post-deploy two-window precondition in code', () => {
  const unblockedVerify = {
    taskKey: 'perf-roadmap-verify',
    stage: 'verify-post-deploy',
    list: 'Live Today',
    regression: F431_BOARD_TASK.regression,
    subscription: { readyAfter: '2026-11-28T00:30:00Z' },
  };
  const missingPrecondition = {
    taskKey: 'perf-roadmap-verify-no-ready-after',
    stage: 'verify-post-deploy',
    list: 'Live Today',
    regression: FORMS_TASK.regression,
  };
  const candidates = [
    {
      id: F431_BOARD_TASK.regression.id,
      app: 'roadmap',
      metric: 'error_rate',
      state: 'ready',
      observedRequests: 80,
      minRequests: 50,
      transition: false,
    },
    {
      id: FORMS_TASK.regression.id,
      app: 'forms',
      metric: 'p95_ttfb_ms',
      state: 'ready',
      observedRequests: 80,
      minRequests: 50,
      transition: false,
    },
  ];

  const tooEarly = evaluateDispatchGate({
    tasks: [unblockedVerify, missingPrecondition],
    detection: { generatedAt: '2026-11-28T00:15:00Z', candidates },
  });
  assert.deepEqual(tooEarly.dispatchable, []);
  assert.deepEqual(tooEarly.skipped, [
    { taskKey: unblockedVerify.taskKey, reason: 'verify_precondition_unmet' },
    {
      taskKey: missingPrecondition.taskKey,
      reason: 'verify_precondition_missing',
    },
  ]);

  const readyNow = evaluateDispatchGate({
    tasks: [unblockedVerify],
    detection: { generatedAt: '2026-11-28T00:30:00Z', candidates },
  });
  assert.deepEqual(readyNow.dispatchable, [unblockedVerify.taskKey]);
});

test('skips insufficient_data, unchecked, active dataGate, and non-regression tasks', () => {
  const thinTask = {
    taskKey: 'perf-roadmap-thin',
    stage: 'investigate',
    list: 'Live Today',
    regression: {
      id: 'perf-roadmap-thin-id',
      app: 'roadmap',
      metric: 'error_rate',
    },
  };
  const parkedTask = {
    ...FORMS_TASK,
    list: 'Queued',
    dataGate: {
      state: 'insufficient_data',
      observedRequests: 3,
      minRequests: 50,
    },
  };
  const readyTask = {
    taskKey: 'perf-tools-p95_ttfb_ms-2026-11-27t120000000z',
    stage: 'investigate',
    list: 'Live Today',
    regression: {
      id: 'perf-tools-p95_ttfb_ms-2026-11-27T120000000Z',
      app: 'tools',
      metric: 'p95_ttfb_ms',
    },
  };
  const uncheckedTask = {
    taskKey: 'perf-teach-p95_ttfb_ms-2026-11-27t120000000z',
    stage: 'investigate',
    list: 'Live Today',
    regression: {
      id: 'perf-teach-p95_ttfb_ms-2026-11-27T120000000Z',
      app: 'teach',
      metric: 'p95_ttfb_ms',
    },
  };
  const result = evaluateDispatchGate({
    tasks: [thinTask, parkedTask, readyTask, uncheckedTask, DEPLOY_TASK],
    detection: {
      generatedAt: '2026-11-28T00:00:00Z',
      candidates: [
        {
          id: thinTask.regression.id,
          app: 'roadmap',
          metric: 'error_rate',
          state: 'insufficient_data',
          observedRequests: 3,
          minRequests: 50,
          transition: true,
        },
        {
          id: parkedTask.regression.id,
          app: 'forms',
          metric: 'p95_ttfb_ms',
          state: 'ready',
          observedRequests: 62,
          minRequests: 50,
          transition: true,
        },
        {
          id: readyTask.regression.id,
          app: 'tools',
          metric: 'p95_ttfb_ms',
          state: 'ready',
          observedRequests: 80,
          minRequests: 50,
          transition: false,
        },
        {
          id: uncheckedTask.regression.id,
          app: 'teach',
          metric: 'p95_ttfb_ms',
          state: 'unchecked',
          transition: false,
        },
      ],
    },
  });
  assert.equal(result.degraded, false);
  assert.deepEqual(result.dispatchable, [readyTask.taskKey]);
  assert.deepEqual(
    result.parked.map((entry) => [entry.taskKey, entry.transition]),
    [[thinTask.taskKey, true]]
  );
  assert.deepEqual(
    result.rearmed.map((entry) => entry.taskKey),
    [parkedTask.taskKey]
  );
  const reasons = Object.fromEntries(
    result.skipped.map((entry) => [entry.taskKey, entry.reason])
  );
  assert.equal(reasons[thinTask.taskKey], 'insufficient_data');
  assert.equal(reasons[parkedTask.taskKey], 'data_gate_active');
  assert.equal(reasons[uncheckedTask.taskKey], 'unchecked');
  assert.equal(reasons[DEPLOY_TASK.taskKey], 'non_regression');
});

test('fails closed when detector exited 2 or produced no candidate output', () => {
  const exited2 = evaluateDispatchGate({
    tasks: [F431_BOARD_TASK, DEPLOY_TASK],
    detection: { candidates: [] },
    detectorExit: 2,
  });
  assert.equal(exited2.degraded, true);
  assert.equal(exited2.degradedReason, 'detector_exit_2');
  assert.match(
    exited2.marker,
    /DEGRADED: dispatch gate closed \(detector_exit_2\)/
  );
  assert.deepEqual(exited2.dispatchable, []);
  assert.deepEqual(exited2.skipped, [
    { taskKey: F431_BOARD_TASK.taskKey, reason: 'detector_exit_2' },
  ]);

  const noCandidates = evaluateDispatchGate({
    tasks: [F431_BOARD_TASK],
    detection: { checked: [], regressions: [] },
    detectorExit: 0,
  });
  assert.equal(noCandidates.degraded, true);
  assert.equal(noCandidates.degradedReason, 'missing_candidate_output');
  assert.deepEqual(noCandidates.dispatchable, []);
});

test('CLI reads a mirror directory and fails closed on missing detection file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-gate-'));
  writeFileSync(join(dir, 'a.json'), JSON.stringify(F431_BOARD_TASK));
  writeFileSync(join(dir, 'b.json'), JSON.stringify(DEPLOY_TASK));

  const missing = runCli([
    '--tasks',
    dir,
    '--detection',
    join(dir, 'missing.json'),
  ]).result;
  assert.equal(missing.degraded, true);
  assert.equal(missing.degradedReason, 'missing_detection_output');
  assert.deepEqual(missing.dispatchable, []);

  const extracted = runCli(['extract-candidates', '--tasks', dir]).result;
  assert.equal(extracted.candidates.length, 1);
  assert.equal(extracted.candidates[0].app, 'roadmap');
});

test('isIntakeBlocked keys on exact id only so a new regression for the same app+metric is still ingested', () => {
  const candidates = [
    {
      id: 'perf-roadmap-error_rate-2026-11-21T033000000Z',
      app: 'roadmap',
      metric: 'error_rate',
      state: 'insufficient_data',
    },
  ];
  assert.equal(
    isIntakeBlocked(
      {
        id: 'perf-roadmap-error_rate-2026-11-21T033000000Z',
        app: 'roadmap',
        metric: 'error_rate',
      },
      candidates
    ),
    true
  );
  assert.equal(
    isIntakeBlocked(
      {
        id: 'perf-roadmap-error_rate-2026-11-28T000000000Z',
        app: 'roadmap',
        metric: 'error_rate',
      },
      candidates
    ),
    false
  );
});

test('zone-less readyAfter and deployedAt fail closed instead of parsing as local time', () => {
  assert.equal(Number.isNaN(parseIsoWithZone('2026-11-28T00:00:00')), true);
  assert.equal(
    Number.isFinite(parseIsoWithZone('2026-11-28T07:00:00+07:00')),
    true
  );
  const zonelessReadyAfter = {
    taskKey: 'perf-zoneless-ready',
    stage: 'verify-post-deploy',
    list: 'Live Today',
    regression: F431_BOARD_TASK.regression,
    subscription: { readyAfter: '2026-11-28T00:00:00' },
  };
  const zonelessDeployedAt = {
    taskKey: 'perf-zoneless-deployed',
    stage: 'verify-post-deploy',
    list: 'Live Today',
    regression: FORMS_TASK.regression,
    fix: { deployedAt: '2026-11-28T00:00:00' },
  };
  const offsetReadyAfter = {
    taskKey: 'perf-offset-ready',
    stage: 'verify-post-deploy',
    list: 'Live Today',
    regression: {
      id: 'perf-tools-offset-id',
      app: 'tools',
      metric: 'p95_ttfb_ms',
    },
    subscription: { readyAfter: '2026-11-28T07:30:00+07:00' },
  };
  const candidates = [
    { id: F431_BOARD_TASK.regression.id, app: 'roadmap', state: 'ready' },
    { id: FORMS_TASK.regression.id, app: 'forms', state: 'ready' },
    { id: 'perf-tools-offset-id', app: 'tools', state: 'ready' },
  ];
  const result = evaluateDispatchGate({
    tasks: [zonelessReadyAfter, zonelessDeployedAt, offsetReadyAfter],
    detection: { generatedAt: '2026-11-28T00:30:00Z', candidates },
  });
  assert.deepEqual(result.dispatchable, ['perf-offset-ready']);
  assert.deepEqual(result.skipped, [
    { taskKey: 'perf-zoneless-ready', reason: 'verify_precondition_unmet' },
    { taskKey: 'perf-zoneless-deployed', reason: 'verify_precondition_unmet' },
  ]);
});

test('S5: leftover blocker clears only on cleared verdict plus explicit zoned timestamp', () => {
  const base = {
    taskKey: 'perf-roadmap-s5',
    stage: 'verify-post-deploy',
    list: 'Live Today',
    regression: F431_BOARD_TASK.regression,
    subscription: {
      readyAfter: '2026-11-21T10:45:00Z',
      verificationBlocker: { reason: 'stale blocker' },
    },
  };
  const detection = {
    generatedAt: '2026-11-28T00:00:00Z',
    candidates: [
      { id: F431_BOARD_TASK.regression.id, app: 'roadmap', state: 'ready' },
    ],
  };

  const recoveredNoTimestamp = {
    ...base,
    verification: { verdict: 'recovered', blocker: 'stale blocker' },
  };
  assert.deepEqual(
    evaluateDispatchGate({ tasks: [recoveredNoTimestamp], detection }).skipped,
    [{ taskKey: base.taskKey, reason: 'verification_blocked' }]
  );

  const blockedWithTimestamp = {
    ...base,
    verification: {
      verdict: 'blocked',
      blocker: 'still blocked',
      clearedAt: '2026-11-28T00:00:00Z',
    },
  };
  assert.deepEqual(
    evaluateDispatchGate({ tasks: [blockedWithTimestamp], detection }).skipped,
    [{ taskKey: base.taskKey, reason: 'verification_blocked' }]
  );

  const recoveredWithTimestamp = {
    ...base,
    verification: {
      verdict: 'recovered',
      blocker: 'stale blocker',
      clearedAt: '2026-11-28T00:00:00Z',
    },
  };
  assert.deepEqual(
    evaluateDispatchGate({ tasks: [recoveredWithTimestamp], detection })
      .dispatchable,
    [base.taskKey]
  );
});

test('intake-check CLI enforces exact-id skip and degraded-reason emits code marker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-gate-cli-'));
  const detectionPath = join(dir, 'detection.json');
  const tasksPath = join(dir, 'tasks.json');
  writeFileSync(
    detectionPath,
    JSON.stringify({
      generatedAt: '2026-11-28T00:00:00Z',
      candidates: [
        {
          id: 'perf-roadmap-error_rate-old',
          app: 'roadmap',
          metric: 'error_rate',
          state: 'insufficient_data',
        },
      ],
      regressions: [
        {
          id: 'perf-roadmap-error_rate-old',
          app: 'roadmap',
          metric: 'error_rate',
        },
        {
          id: 'perf-roadmap-error_rate-new',
          app: 'roadmap',
          metric: 'error_rate',
        },
      ],
    })
  );
  writeFileSync(tasksPath, JSON.stringify([FORMS_TASK]));

  const intake = runCli(['intake-check', '--detection', detectionPath]).result;
  assert.equal(intake.degraded, false);
  assert.deepEqual(
    intake.blocked.map((r) => r.id),
    ['perf-roadmap-error_rate-old']
  );
  assert.deepEqual(
    intake.ingestible.map((r) => r.id),
    ['perf-roadmap-error_rate-new']
  );
  assert.equal(evaluateIntake({ regressions: [] }).degraded, true);

  const extractFailed = runCli([
    '--tasks',
    tasksPath,
    '--degraded-reason',
    'extract_candidates_failed',
  ]).result;
  assert.equal(extractFailed.degraded, true);
  assert.equal(
    extractFailed.marker,
    'DEGRADED: dispatch gate closed (extract_candidates_failed)'
  );
  assert.deepEqual(extractFailed.dispatchable, []);
});
