export const activeStates = new Set(['pending', 'running']);
const terminalStates = new Set(['cancelled', 'completed', 'failed']);
const runStates = new Set([...activeStates, ...terminalStates, 'paused']);
export const runOperations = new Set(['audit', 'backfill', 'reconcile']);

type ControlAction =
  | 'adopt'
  | 'audit'
  | 'cancel'
  | 'reconcile'
  | 'resume'
  | 'start';

export function readRemoteRun(remote: unknown, runId: string) {
  if (!isRecord(remote)) return null;
  if (remote.runId === runId) return remote;
  if (!Array.isArray(remote.runs)) return null;
  return (
    remote.runs.find(
      (run): run is Record<string, unknown> =>
        isRecord(run) && run.runId === runId
    ) ?? null
  );
}

export function buildRunUpdate(
  remote: Record<string, unknown> | null,
  fallback: string,
  existingStartedAt: string | null,
  action?: ControlAction
) {
  const now = new Date().toISOString();
  const remoteState = typeof remote?.state === 'string' ? remote.state : null;
  const state =
    remoteState && runStates.has(remoteState) ? remoteState : fallback;
  const update: Record<string, unknown> = { state, updated_at: now };
  assignObjectField(update, 'cursor', remote?.cursor);
  assignObjectField(update, 'high_water_mark', remote?.highWater);
  assignObjectField(update, 'source_counts', remote?.sourceCounts);
  assignObjectField(update, 'target_counts', remote?.targetCounts);
  if (Array.isArray(remote?.digestResults))
    update.digest_results = remote.digestResults;
  if (typeof remote?.errorCode === 'string' || remote?.errorCode === null)
    update.error_code = remote.errorCode;
  if (!existingStartedAt)
    assignTimestampField(update, 'started_at', remote?.startedAt);
  assignTimestampField(update, 'finished_at', remote?.finishedAt);
  if (action === 'resume' && !terminalStates.has(state)) {
    update.error_code = null;
    update.finished_at = null;
  }
  if (state !== 'cancelled' && !update.started_at && !existingStartedAt)
    update.started_at = now;
  if (terminalStates.has(state) && !update.finished_at)
    update.finished_at = now;
  return update;
}

export function publicRemoteRun(
  runId: string,
  operation: string,
  update: Record<string, unknown>
) {
  return {
    cursor: update.cursor ?? {},
    digestResults: update.digest_results ?? [],
    errorCode: update.error_code ?? null,
    finishedAt: update.finished_at ?? null,
    highWater: update.high_water_mark ?? {},
    operation,
    runId,
    sourceCounts: update.source_counts ?? {},
    startedAt: update.started_at ?? null,
    state: update.state,
    targetCounts: update.target_counts ?? {},
  };
}

export function expectedControlStates(action: ControlAction) {
  if (action === 'cancel') return ['pending', 'running'];
  if (action === 'resume') return ['failed', 'paused'];
  return ['pending'];
}

function assignObjectField(
  target: Record<string, unknown>,
  key: string,
  value: unknown
) {
  if (isRecord(value)) target[key] = value;
}

function assignTimestampField(
  target: Record<string, unknown>,
  key: string,
  value: unknown
) {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value)))
    target[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
