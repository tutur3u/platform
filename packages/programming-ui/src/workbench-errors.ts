/** Which request failed, so the message names the step instead of "Request failed". */
export type WorkbenchFailureStep = 'save' | 'run' | 'result' | 'test';
export type WorkbenchFailureReason =
  | 'access'
  | 'changed'
  | 'busy'
  | 'capacity'
  | 'paused'
  | 'unavailable'
  | 'offline'
  | 'unknown';

export interface WorkbenchFailure {
  step: WorkbenchFailureStep;
  reason: WorkbenchFailureReason;
}

/** Tags an error from a multi-step request (a run first saves the room) with the step that failed. */
export class WorkbenchStepError extends Error {
  constructor(
    readonly step: WorkbenchFailureStep,
    readonly reasonSource: unknown
  ) {
    super(`Programming ${step} failed`);
    this.name = 'WorkbenchStepError';
  }
}

/** Maps an API error (status-bearing, e.g. InternalApiError) to a reason the UI can explain. */
export function failureReason(error: unknown): WorkbenchFailureReason {
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'PLAYGROUND_PAUSED') return 'paused';
    if (error.code === 'PLAYGROUND_CAPACITY') return 'capacity';
  }
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number((error as { status: unknown }).status)
      : Number.NaN;
  if (status === 401 || status === 403) return 'access';
  if (status === 409 || status === 412) return 'changed';
  if (status === 429) return 'busy';
  // No runner can take the job (or the service is down): a quick retry does not help.
  if (status === 502 || status === 503 || status === 504) return 'unavailable';
  if (
    Number.isNaN(status) &&
    (error instanceof TypeError ||
      (typeof navigator !== 'undefined' && navigator.onLine === false))
  )
    return 'offline';
  return 'unknown';
}

/**
 * The first failed step in the order the user experiences them: saving the
 * room blocks a run, a run must start before its result can be read.
 */
export function workbenchFailure(errors: {
  save?: unknown;
  run?: unknown;
  result?: unknown;
  test?: unknown;
}): WorkbenchFailure | null {
  for (const step of ['save', 'run', 'result', 'test'] as const) {
    const error = errors[step];
    if (!error) continue;
    return error instanceof WorkbenchStepError
      ? { step: error.step, reason: failureReason(error.reasonSource) }
      : { step, reason: failureReason(error) };
  }
  return null;
}

/**
 * Whether a failed run means the code runner itself cannot take runs (it
 * answered 502/503/504), not that saving the room first failed.
 */
export function isRunnerUnavailable(error: unknown) {
  if (error instanceof WorkbenchStepError)
    return (
      error.step === 'run' &&
      failureReason(error.reasonSource) === 'unavailable'
    );
  return failureReason(error) === 'unavailable';
}
