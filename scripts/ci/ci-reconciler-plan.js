const LIVE = new Set([
  'queued',
  'in_progress',
  'waiting',
  'requested',
  'pending',
]);
const DONE = new Set([
  'success',
  'failure',
  'skipped',
  'neutral',
  'timed_out',
  'action_required',
  'stale',
  'cancelled',
]);
const RECEIPT = new Set(['planned', 'accepted', 'rejected', 'unknown']);

function guard(condition, code) {
  if (!condition) throw new Error(code);
}

function integer(value, minimum = 1) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function timestamp(value) {
  guard(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value),
    'INVALID_DATE'
  );
  const result = Date.parse(value);
  guard(Number.isSafeInteger(result) && result >= 0, 'INVALID_DATE');
  guard(
    new Date(result).toISOString().replace('.000Z', 'Z') ===
      value.replace('.000Z', 'Z'),
    'INVALID_DATE'
  );
  return result;
}

function validate(input) {
  guard(input !== null && typeof input === 'object', 'INVALID_INPUT');
  const {
    sha,
    workflow,
    runs,
    receipts,
    now,
    recoveryEnabled,
    maxAttempts,
    backoffSeconds,
  } = input;
  guard(
    typeof sha === 'string' && /^[a-fA-F0-9]{40}$/.test(sha),
    'INVALID_SHA'
  );
  guard(
    workflow !== null &&
      typeof workflow === 'object' &&
      typeof workflow.file === 'string' &&
      /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.ya?ml$/.test(workflow.file) &&
      workflow.file.length <= 128 &&
      typeof workflow.dispatch === 'boolean' &&
      (workflow.protected === undefined ||
        typeof workflow.protected === 'boolean'),
    'INVALID_WORKFLOW'
  );
  guard(integer(now, 0) && now <= 8640000000000000, 'INVALID_NOW');
  guard(typeof recoveryEnabled === 'boolean', 'INVALID_ENABLED');
  guard(integer(maxAttempts) && maxAttempts <= 3, 'INVALID_CAP');
  guard(
    Array.isArray(backoffSeconds) &&
      backoffSeconds.length === 3 &&
      backoffSeconds.every(
        (value, index) =>
          integer(value) && value >= [60, 300, 900][index] && value <= 86400
      ),
    'INVALID_BACKOFF'
  );
  guard(Array.isArray(runs) && runs.length <= 100, 'INVALID_RUNS');
  guard(Array.isArray(receipts) && receipts.length <= 3, 'INVALID_RECEIPTS');
  const ids = new Set();
  for (const run of runs) {
    guard(
      run !== null &&
        typeof run === 'object' &&
        integer(run.id) &&
        typeof run.head_sha === 'string' &&
        /^[a-fA-F0-9]{40}$/.test(run.head_sha) &&
        integer(run.run_attempt) &&
        (LIVE.has(run.status) || run.status === 'completed') &&
        (run.status === 'completed'
          ? DONE.has(run.conclusion)
          : run.conclusion === null),
      'INVALID_RUN'
    );
    guard(!ids.has(run.id), 'DUPLICATE_RUN');
    ids.add(run.id);
    guard(
      timestamp(run.created_at) <= timestamp(run.updated_at) &&
        timestamp(run.updated_at) <= now,
      'INVALID_RUN_TIME'
    );
  }
  const attempts = new Set();
  for (const receipt of receipts) {
    guard(
      receipt !== null &&
        typeof receipt === 'object' &&
        integer(receipt.attempt) &&
        receipt.attempt <= 3 &&
        RECEIPT.has(receipt.status) &&
        (receipt.runId === undefined || integer(receipt.runId)) &&
        (receipt.baselineAttempt === undefined ||
          (integer(receipt.baselineAttempt) && integer(receipt.runId))),
      'INVALID_RECEIPT'
    );
    guard(!attempts.has(receipt.attempt), 'DUPLICATE_RECEIPT');
    attempts.add(receipt.attempt);
    guard(timestamp(receipt.plannedAt) <= now, 'INVALID_RECEIPT_TIME');
  }
  const ordered = [...receipts].sort((a, b) => a.attempt - b.attempt);
  ordered.forEach((receipt, index) => {
    guard(receipt.attempt === index + 1, 'INCOMPLETE_HISTORY');
    if (index)
      guard(
        timestamp(receipt.plannedAt) >= timestamp(ordered[index - 1].plannedAt),
        'INVALID_RECEIPT_ORDER'
      );
  });
}

function identified(receipt, runs) {
  if (receipt.baselineAttempt !== undefined) {
    return runs.some(
      (run) =>
        run.id === receipt.runId && run.run_attempt > receipt.baselineAttempt
    );
  }
  // Dispatch readback requires the durable accepted record's run identity.
  return (
    receipt.status === 'accepted' &&
    receipt.runId !== undefined &&
    runs.some(
      (run) =>
        run.id === receipt.runId &&
        timestamp(run.created_at) >= timestamp(receipt.plannedAt)
    )
  );
}

/** Plan only: callers own trusted policy, complete history and head rechecks. */
export function decideRecovery(input = {}) {
  guard(
    input !== null && typeof input === 'object' && !Array.isArray(input),
    'INVALID_INPUT'
  );
  const {
    sha,
    workflow,
    runs,
    receipts,
    now,
    recoveryEnabled = false,
    maxAttempts = 3,
    backoffSeconds = [60, 300, 900],
  } = input;
  validate({
    sha,
    workflow,
    runs,
    receipts,
    now,
    recoveryEnabled,
    maxAttempts,
    backoffSeconds,
  });
  const current = runs
    .filter((run) => run.head_sha.toLowerCase() === sha.toLowerCase())
    .sort(
      (a, b) => timestamp(b.created_at) - timestamp(a.created_at) || b.id - a.id
    );
  const live = current.find((run) => LIVE.has(run.status));
  if (live)
    return { kind: 'dedupe', code: 'CURRENT_RUN_ACTIVE', runId: live.id };
  const terminal =
    current[0]?.conclusion !== 'cancelled' ? current[0] : undefined;
  if (terminal)
    return {
      kind: 'terminal',
      code: 'CURRENT_RUN_TERMINAL',
      runId: terminal.id,
      conclusion: terminal.conclusion,
    };
  if (workflow.protected)
    return { kind: 'blocked', code: 'PROTECTED_WORKFLOW' };
  const cancelled = current[0];
  if (!cancelled && !workflow.dispatch)
    return { kind: 'blocked', code: 'DISPATCH_UNSUPPORTED' };
  for (const receipt of receipts) {
    if (receipt.status !== 'rejected' && !identified(receipt, current)) {
      return {
        kind: 'blocked',
        code: 'UNKNOWN_WRITE',
        attempt: receipt.attempt,
      };
    }
  }
  if (receipts.length >= maxAttempts)
    return { kind: 'capped', code: 'RECOVERY_CAP', attempt: receipts.length };
  const attempt = receipts.length + 1;
  const latest = [...receipts].sort((a, b) => b.attempt - a.attempt)[0];
  const anchor = latest
    ? timestamp(latest.plannedAt)
    : cancelled
      ? timestamp(cancelled.updated_at)
      : undefined;
  const nextAt =
    anchor === undefined ? now : anchor + backoffSeconds[attempt - 1] * 1000;
  guard(Number.isSafeInteger(nextAt), 'INVALID_NEXT_TIME');
  if (now < nextAt)
    return { kind: 'backoff', code: 'RECOVERY_BACKOFF', attempt, nextAt };
  const kind = cancelled ? 'rerun' : 'dispatch';
  const action = {
    kind,
    code: cancelled ? 'CANCELLED_RUN' : 'MISSING_RUN',
    attempt,
  };
  if (cancelled) action.runId = cancelled.id;
  if (!recoveryEnabled)
    return {
      ...action,
      kind: 'observe',
      code: 'RECOVERY_DISABLED',
      proposedAction: kind,
    };
  return action;
}
