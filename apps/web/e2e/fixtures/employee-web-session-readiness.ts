import type { ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

type Observation =
  | 'none'
  | 'connection-failure'
  | 'request-error'
  | 'request-timeout'
  | 'unexpected-status'
  | 'ready';
export type StartupDiagnostic = {
  outcome: 'ready' | 'child-exit' | 'child-error' | 'deadline';
  lastResult: Observation;
  status: number | null;
  attempts: number;
  exitCode: number | null;
  signal: 'SIGTERM' | 'SIGKILL' | 'other' | null;
  timedOut: boolean;
};

export async function waitForSessionReadiness(
  child: ChildProcess,
  endpoint: string,
  { maxAttempts = 60, requestTimeoutMs = 1000, intervalMs = 500 } = {}
): Promise<StartupDiagnostic> {
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 60 ||
    !Number.isInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1 ||
    requestTimeoutMs > 1000 ||
    !Number.isInteger(intervalMs) ||
    intervalMs < 0 ||
    intervalMs > 500
  )
    throw new Error('Web startup limits invalid');
  let attempts = 0;
  let status: number | null = null;
  let lastResult: Observation = 'none';
  let childError = false;
  const onError = () => {
    childError = true;
  };
  child.on('error', onError);
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  const result = (
    outcome: StartupDiagnostic['outcome']
  ): StartupDiagnostic => ({
    outcome,
    lastResult,
    status,
    attempts,
    exitCode: child.exitCode,
    signal:
      child.signalCode === null
        ? null
        : child.signalCode === 'SIGTERM' || child.signalCode === 'SIGKILL'
          ? child.signalCode
          : 'other',
    timedOut: outcome === 'deadline',
  });
  try {
    while (attempts < maxAttempts) {
      if (childError) return result('child-error');
      if (exited()) return result('child-exit');
      attempts++;
      const signal = AbortSignal.timeout(requestTimeoutMs);
      try {
        const response = await fetch(endpoint, { redirect: 'manual', signal });
        status = response.status;
        // Readiness consumes only the status; discard the body without buffering it.
        void response.body?.cancel().catch(() => {});
        lastResult = status === 401 ? 'ready' : 'unexpected-status';
        if (childError) return result('child-error');
        if (exited()) return result('child-exit');
        if (status === 401) return result('ready');
      } catch (error) {
        const cause =
          error instanceof Error && 'cause' in error ? error.cause : null;
        const code =
          cause && typeof cause === 'object' && 'code' in cause
            ? cause.code
            : error instanceof Error && 'code' in error
              ? error.code
              : null;
        lastResult = signal.aborted
          ? 'request-timeout'
          : [
                'ECONNREFUSED',
                'ECONNRESET',
                'EHOSTUNREACH',
                'ENETUNREACH',
                'ENOTFOUND',
                'ConnectionRefused',
              ].includes(typeof code === 'string' ? code : '')
            ? 'connection-failure'
            : 'request-error';
      }
      if (childError) return result('child-error');
      if (exited()) return result('child-exit');
      await delay(intervalMs);
    }
    if (childError) return result('child-error');
    if (exited()) return result('child-exit');
    return result('deadline');
  } finally {
    child.off('error', onError);
  }
}
