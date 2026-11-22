/** Which request failed, so the message names the step instead of "Request failed". */
/** `start`: the run was accepted but the service could not start or sandbox it. */
export type WorkbenchFailureStep = 'save' | 'run' | 'start' | 'result' | 'test';
export type WorkbenchFailureReason =
  | 'access'
  | 'changed'
  | 'busy'
  | 'capacity'
  | 'unavailable'
  | 'sandbox'
  | 'offline'
  | 'unknown';

export interface WorkbenchFailure {
  step: WorkbenchFailureStep;
  reason: WorkbenchFailureReason;
  /** From `Retry-After`: when a refused request may succeed again. */
  retryAfterSeconds?: number;
}

/** The refusal code of an API error, e.g. `PLAYGROUND_BUSY`. */
export function errorCode(error: unknown): string | undefined {
  const source =
    error instanceof WorkbenchStepError ? error.reasonSource : error;
  return source && typeof source === 'object' && 'code' in source
    ? String(source.code)
    : undefined;
}

/** Whole seconds from the error's retry hint (`Retry-After` or the body), if any. */
export function retryAfterSeconds(error: unknown): number | undefined {
  const source =
    error instanceof WorkbenchStepError ? error.reasonSource : error;
  if (!source || typeof source !== 'object') return undefined;
  const value = Number(
    'retryAfter' in source
      ? source.retryAfter
      : 'retryAfterSeconds' in source
        ? source.retryAfterSeconds
        : Number.NaN
  );
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
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
    if (error.code === 'PLAYGROUND_UNAVAILABLE') return 'unavailable';
    if (error.code === 'PLAYGROUND_BUSY') return 'busy';
    if (error.code === 'PLAYGROUND_QUOTA') return 'capacity';
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
    const failure: WorkbenchFailure =
      error instanceof WorkbenchStepError
        ? { step: error.step, reason: failureReason(error.reasonSource) }
        : { step, reason: failureReason(error) };
    const retryAfter = retryAfterSeconds(error);
    return retryAfter ? { ...failure, retryAfterSeconds: retryAfter } : failure;
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
