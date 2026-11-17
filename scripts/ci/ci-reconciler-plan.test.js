import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideRecovery } from './ci-reconciler-plan.js';

const sha = 'a'.repeat(40);
const now = Date.parse('2026-11-17T12:00:00Z');
const iso = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();
const run = (overrides = {}) => ({
  id: 42,
  head_sha: sha,
  status: 'completed',
  conclusion: 'cancelled',
  run_attempt: 1,
  created_at: iso(3600),
  updated_at: iso(120),
  ...overrides,
});
const receipt = (attempt, overrides = {}) => ({
  attempt,
  plannedAt: iso(1200 - attempt),
  status: 'rejected',
  ...overrides,
});
const plan = (overrides = {}) =>
  decideRecovery({
    sha,
    workflow: { file: 'test.yaml', dispatch: true },
    runs: [],
    receipts: [],
    now,
    recoveryEnabled: true,
    ...overrides,
  });

test('stale runs never supply a recovery target or terminal result', () => {
  for (const status of ['completed', 'queued']) {
    assert.deepEqual(
      plan({
        runs: [
          run({
            head_sha: 'b'.repeat(40),
            status,
            conclusion: status === 'completed' ? 'success' : null,
          }),
        ],
      }),
      { kind: 'dispatch', code: 'MISSING_RUN', attempt: 1 }
    );
  }
});

test('every live status dedupes the same head, including protected workflows', () => {
  for (const status of [
    'queued',
    'in_progress',
    'waiting',
    'requested',
    'pending',
  ]) {
    assert.deepEqual(
      plan({
        workflow: { file: 'release.yml', dispatch: false, protected: true },
        runs: [run({ status, conclusion: null })],
      }),
      { kind: 'dedupe', code: 'CURRENT_RUN_ACTIVE', runId: 42 }
    );
  }
});

test('non-cancelled completed outcomes stay terminal, including failures', () => {
  for (const conclusion of [
    'success',
    'failure',
    'skipped',
    'neutral',
    'timed_out',
    'action_required',
    'stale',
  ]) {
    assert.deepEqual(plan({ runs: [run({ conclusion })] }), {
      kind: 'terminal',
      code: 'CURRENT_RUN_TERMINAL',
      runId: 42,
      conclusion,
    });
  }
});

test('a newer cancellation cannot be hidden by an older terminal result', () => {
  assert.deepEqual(
    plan({
      runs: [
        run({ id: 43, created_at: iso(1000) }),
        run({ conclusion: 'success' }),
      ],
    }),
    { kind: 'rerun', code: 'CANCELLED_RUN', attempt: 1, runId: 43 }
  );
});

test('cancelled recovery targets only the latest exact-head run', () => {
  assert.deepEqual(
    plan({
      runs: [
        run(),
        run({ id: 43, created_at: iso(1000) }),
        run({ id: 44, head_sha: 'b'.repeat(40), created_at: iso(500) }),
      ],
    }),
    { kind: 'rerun', code: 'CANCELLED_RUN', attempt: 1, runId: 43 }
  );
});

test('missing unsupported and protected work never mutates', () => {
  assert.deepEqual(plan({ workflow: { file: 'test.yml', dispatch: false } }), {
    kind: 'blocked',
    code: 'DISPATCH_UNSUPPORTED',
  });
  for (const runs of [[], [run()]]) {
    assert.deepEqual(
      plan({
        workflow: { file: 'release.yml', dispatch: true, protected: true },
        runs,
      }),
      { kind: 'blocked', code: 'PROTECTED_WORKFLOW' }
    );
  }
});

test('three rejected intents exhaust the cap and custom lower caps are honored', () => {
  assert.deepEqual(plan({ receipts: [receipt(1), receipt(2), receipt(3)] }), {
    kind: 'capped',
    code: 'RECOVERY_CAP',
    attempt: 3,
  });
  assert.equal(plan({ maxAttempts: 1, receipts: [receipt(1)] }).kind, 'capped');
});

test('one, five and fifteen minute delays use durable timestamps', () => {
  const cases = [
    { runs: [run({ updated_at: iso(59) })], receipts: [], wait: 1, attempt: 1 },
    {
      runs: [],
      receipts: [receipt(1, { plannedAt: iso(299) })],
      wait: 1,
      attempt: 2,
    },
    {
      runs: [],
      receipts: [receipt(1), receipt(2, { plannedAt: iso(899) })],
      wait: 1,
      attempt: 3,
    },
  ];
  for (const { runs, receipts, wait, attempt } of cases) {
    assert.deepEqual(plan({ runs, receipts }), {
      kind: 'backoff',
      code: 'RECOVERY_BACKOFF',
      attempt,
      nextAt: now + wait * 1000,
    });
    assert.ok(
      ['rerun', 'dispatch'].includes(
        plan({ runs, receipts, now: now + 1000 }).kind
      )
    );
  }
  assert.equal(plan().kind, 'dispatch');
});

test('unknown or planned writes without readback block rather than replay', () => {
  for (const status of ['unknown', 'planned', 'accepted']) {
    assert.deepEqual(plan({ receipts: [receipt(1, { status })] }), {
      kind: 'blocked',
      code: 'UNKNOWN_WRITE',
      attempt: 1,
    });
  }
});

test('a later same-run attempt reconciles a rerun intent', () => {
  const intent = receipt(1, {
    status: 'unknown',
    runId: 42,
    baselineAttempt: 1,
  });
  assert.equal(
    plan({ runs: [run()], receipts: [intent] }).code,
    'UNKNOWN_WRITE'
  );
  assert.deepEqual(
    plan({ runs: [run({ run_attempt: 2 })], receipts: [intent] }),
    { kind: 'rerun', code: 'CANCELLED_RUN', attempt: 2, runId: 42 }
  );
  assert.equal(
    plan({
      runs: [run({ run_attempt: 2, head_sha: 'b'.repeat(40) })],
      receipts: [intent],
    }).code,
    'UNKNOWN_WRITE'
  );
});

test('dispatch readback requires accepted matching identity and creation time', () => {
  const intent = receipt(1, {
    status: 'accepted',
    runId: 42,
    plannedAt: iso(2000),
  });
  assert.equal(
    plan({ runs: [run()], receipts: [intent] }).code,
    'UNKNOWN_WRITE'
  );
  assert.equal(
    plan({ runs: [run({ created_at: iso(1900) })], receipts: [intent] }).kind,
    'rerun'
  );
  assert.equal(
    plan({ runs: [run({ id: 43, created_at: iso(1900) })], receipts: [intent] })
      .code,
    'UNKNOWN_WRITE'
  );
  assert.equal(
    plan({
      runs: [run({ created_at: iso(1900) })],
      receipts: [{ ...intent, status: 'planned' }],
    }).code,
    'UNKNOWN_WRITE'
  );
});

test('disabled recovery describes the proposed operation without acting', () => {
  assert.deepEqual(plan({ recoveryEnabled: false }), {
    kind: 'observe',
    code: 'RECOVERY_DISABLED',
    proposedAction: 'dispatch',
    attempt: 1,
  });
  assert.deepEqual(plan({ recoveryEnabled: false, runs: [run()] }), {
    kind: 'observe',
    code: 'RECOVERY_DISABLED',
    proposedAction: 'rerun',
    attempt: 1,
    runId: 42,
  });
  assert.equal(
    decideRecovery({
      sha,
      workflow: { file: 'test.yml', dispatch: true },
      runs: [],
      receipts: [],
      now,
    }).kind,
    'observe'
  );
});

test('malformed or incomplete inputs throw fixed codes without raw values', () => {
  for (const input of [null, [], 'private-value']) {
    assert.throws(
      () => decideRecovery(input),
      (error) => error.message === 'INVALID_INPUT'
    );
  }
  const cases = [
    [{ sha: 'private-value' }, 'INVALID_SHA'],
    [
      { workflow: { file: '../private-value.yml', dispatch: true } },
      'INVALID_WORKFLOW',
    ],
    [{ workflow: { file: 'test.yml' } }, 'INVALID_WORKFLOW'],
    [{ runs: undefined }, 'INVALID_RUNS'],
    [{ receipts: undefined }, 'INVALID_RECEIPTS'],
    [{ runs: Array(101).fill(run()) }, 'INVALID_RUNS'],
    [{ receipts: Array(4).fill(receipt(1)) }, 'INVALID_RECEIPTS'],
    [{ runs: [run({ id: Number.MAX_SAFE_INTEGER + 1 })] }, 'INVALID_RUN'],
    [{ runs: [run({ status: 'private-value' })] }, 'INVALID_RUN'],
    [{ runs: [run({ conclusion: null })] }, 'INVALID_RUN'],
    [{ runs: [run({ updated_at: '2026-02-30T12:00:00Z' })] }, 'INVALID_DATE'],
    [{ runs: [run({ updated_at: iso(-1) })] }, 'INVALID_RUN_TIME'],
    [{ runs: [run(), run()] }, 'DUPLICATE_RUN'],
    [{ receipts: [receipt(2)] }, 'INCOMPLETE_HISTORY'],
    [{ receipts: [receipt(1), receipt(1)] }, 'DUPLICATE_RECEIPT'],
    [{ receipts: [receipt(1, { baselineAttempt: 1 })] }, 'INVALID_RECEIPT'],
    [{ maxAttempts: 4 }, 'INVALID_CAP'],
    [{ backoffSeconds: [0, 300, 900] }, 'INVALID_BACKOFF'],
    [{ recoveryEnabled: 'true' }, 'INVALID_ENABLED'],
    [{ now: NaN }, 'INVALID_NOW'],
  ];
  for (const [overrides, code] of cases) {
    assert.throws(
      () => plan(overrides),
      (error) => error.message === code
    );
  }
});

test('frozen input remains unchanged and ordering is deterministic', () => {
  const runs = Object.freeze([
    Object.freeze(run()),
    Object.freeze(run({ id: 43 })),
  ]);
  const receipts = Object.freeze([Object.freeze(receipt(1))]);
  const workflow = Object.freeze({ file: 'test.yml', dispatch: true });
  const input = Object.freeze({
    sha,
    workflow,
    runs,
    receipts,
    now,
    recoveryEnabled: true,
  });
  assert.deepEqual(
    decideRecovery(input),
    decideRecovery({ ...input, runs: [...runs].reverse() })
  );
  assert.equal(runs[0].id, 42);
  assert.equal(receipts[0].status, 'rejected');
});
