const MAX_ATTEMPTS = 3;

export interface ProviderOperation {
  readonly id: string;
  readonly deadline: number;
  readonly attempts: number;
  readonly state:
    | 'ready'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'unknown'
    | 'stopped';
}

export function createProviderOperation(
  id: string,
  deadline: number
): ProviderOperation | null {
  if (!id || !Number.isFinite(deadline)) return null;
  return { id, deadline, attempts: 0, state: 'ready' };
}

// Persist the transition atomically before dispatching one provider call.
export function beginProviderAttempt(
  operation: ProviderOperation,
  now: number
): ProviderOperation | null {
  if (
    operation.state !== 'ready' ||
    operation.attempts >= MAX_ATTEMPTS ||
    !Number.isFinite(now) ||
    now >= operation.deadline
  ) {
    return null;
  }
  return {
    ...operation,
    attempts: operation.attempts + 1,
    state: 'running',
  };
}

export function completeProviderAttempt(
  operation: ProviderOperation,
  receipt: {
    readonly operationId: string;
    readonly attempt: number;
    readonly outcome:
      | 'succeeded'
      | 'retryable-no-effect'
      | 'failed'
      | 'unknown';
  }
): ProviderOperation | null {
  if (
    operation.state !== 'running' ||
    operation.id !== receipt.operationId ||
    operation.attempts !== receipt.attempt
  ) {
    return null;
  }
  const state =
    receipt.outcome === 'retryable-no-effect'
      ? operation.attempts < MAX_ATTEMPTS
        ? 'ready'
        : 'failed'
      : receipt.outcome;
  return { ...operation, state };
}

export function stopProviderOperation(
  operation: ProviderOperation
): ProviderOperation {
  return operation.state === 'ready' || operation.state === 'running'
    ? { ...operation, state: 'stopped' }
    : operation;
}
