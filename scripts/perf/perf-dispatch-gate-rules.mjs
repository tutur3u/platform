// Pure predicate and precondition helpers for the Performance Factory dispatch
// gate. Kept free of I/O so the gate rules are small, readable, and easy to
// test in isolation.
import { CANDIDATE_INSUFFICIENT_DATA } from './perf-regression-rules.mjs';

export const DEFAULT_READY_LISTS = Object.freeze(['Queued', 'Live Today']);
export const DEFAULT_WINDOW_MINUTES = 15;
export const NON_DISPATCHABLE_STAGES = new Set([
  'human-approval',
  'done',
  'closed',
  'deployment-triage',
]);

const EXPLICIT_TZ_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const CLEARED_VERDICTS = new Set([
  'recovered',
  'passed',
  'cleared',
  'reopened',
]);

/**
 * Parse an ISO-8601 timestamp ONLY when it carries an explicit timezone (`Z`
 * or `±HH:MM`). Zone-less timestamps would otherwise parse in host-local time
 * and can satisfy preconditions hours early; return NaN so callers fail closed.
 */
export function parseIsoWithZone(value) {
  if (typeof value !== 'string' || !EXPLICIT_TZ_RE.test(value.trim())) {
    return Number.NaN;
  }
  return Date.parse(value);
}

export function isRegressionTask(task) {
  if (!task || typeof task !== 'object') return false;
  if (
    task.type === 'production_deploy_failure' ||
    task.productionFailure ||
    task.stage === 'deployment-triage'
  ) {
    return false;
  }
  const id = task.regression?.id ?? task.id ?? null;
  const app = task.regression?.app ?? task.app ?? null;
  return Boolean(id && app);
}

export function taskKeyOf(task) {
  return task?.taskKey ?? task?.regression?.id ?? task?.id ?? 'unknown';
}

/**
 * Fail-closed board-list check: only tasks explicitly carrying a list name in
 * `readySet` (`Queued` or `Live Today`) pass. Missing/null/empty list names
 * (such as raw mirror files) return `'missing_list'`.
 */
export function listSkipReason(task, readySet) {
  const raw = task?.list ?? task?.listName ?? null;
  const listName = typeof raw === 'string' ? raw.trim() : '';
  if (!listName) return 'missing_list';
  if (!readySet.has(listName)) return 'list_not_ready';
  return null;
}

/**
 * Stored verification blocker check:
 * - `verification.verdict === 'blocked'` is always blocked.
 * - A leftover `verification.blocker` or `subscription.verificationBlocker`
 *   stays blocked UNLESS `verification.verdict` is in a cleared/recovered
 *   state (`recovered`, `passed`, `cleared`, `reopened`) AND an explicit zoned
 *   clearance timestamp (`verification.clearedAt` or `verification.updatedAt`)
 *   is present.
 */
export function hasVerificationBlocker(task) {
  const verification = task?.verification;
  if (verification?.verdict === 'blocked') return true;
  const hasStoredBlocker = Boolean(
    verification?.blocker || task?.subscription?.verificationBlocker
  );
  if (!hasStoredBlocker) return false;
  const clearedAt = verification?.clearedAt ?? verification?.updatedAt ?? null;
  if (
    CLEARED_VERDICTS.has(verification?.verdict) &&
    Number.isFinite(parseIsoWithZone(clearedAt))
  ) {
    return false;
  }
  return true;
}

/**
 * Enforce the `verify-post-deploy` precondition in code: two full detector
 * windows must have closed after deploy (`subscription.readyAfter` or
 * `fix.deployedAt + 2 * windowMinutes`) relative to `detection.generatedAt`.
 * All timestamps require an explicit timezone (`Z` or `±HH:MM`) and fail
 * closed if missing, zone-less, or not yet reached.
 */
export function verifyPreconditionSkipReason(
  task,
  detection,
  windowMinutes = DEFAULT_WINDOW_MINUTES
) {
  if (task?.stage !== 'verify-post-deploy') return null;
  const generatedMs = parseIsoWithZone(detection?.generatedAt);
  if (!Number.isFinite(generatedMs)) return 'verify_precondition_unmet';
  const readyAfter = task?.subscription?.readyAfter ?? null;
  if (readyAfter !== null) {
    const readyMs = parseIsoWithZone(readyAfter);
    if (!Number.isFinite(readyMs) || generatedMs < readyMs) {
      return 'verify_precondition_unmet';
    }
    return null;
  }
  const deployedAt = task?.fix?.deployedAt ?? null;
  if (deployedAt !== null) {
    const deployedMs = parseIsoWithZone(deployedAt);
    const neededMs = deployedMs + 2 * windowMinutes * 60_000;
    if (!Number.isFinite(deployedMs) || generatedMs < neededMs) {
      return 'verify_precondition_unmet';
    }
    return null;
  }
  return 'verify_precondition_missing';
}

/**
 * Intake guard keyed on exact regression `id` ONLY: detected regression records
 * already passed `usable(window, rules)` (>= 50 requests), so a genuine new
 * regression for the same `(app, metric)` with a new `startTime` (new `id`)
 * must still be ingested even while an older candidate is parked.
 */
export function isIntakeBlocked(regression, candidates = []) {
  if (!regression?.id) return false;
  return candidates.some(
    (candidate) =>
      candidate.state === CANDIDATE_INSUFFICIENT_DATA &&
      candidate.id === regression.id
  );
}
