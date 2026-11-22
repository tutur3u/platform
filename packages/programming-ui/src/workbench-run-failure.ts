import { type WorkbenchFailure, workbenchFailure } from './workbench-errors';

interface Step {
  error: unknown;
}

/**
 * The failure the console shows and the retry that fixes it. A Run the
 * service accepted but could not start or sandbox is its own failure, after
 * every request error, and never the program's exit code.
 */
export function workbenchRunFailure({
  save,
  run,
  result,
  test,
  sandboxFailed,
  retrySave,
  retryTest,
  retryResult,
  retryRun,
  runAgain,
}: {
  save: Step;
  run: Step & { variables?: unknown };
  result: Step;
  test: Step;
  sandboxFailed: boolean;
  retrySave: () => void;
  retryTest: () => void;
  retryResult: () => void;
  /** Repeats the last Run or Stop with its request ID, so an accepted Run is not repeated. */
  retryRun: () => void;
  /** Starts a new Run with a new request ID. */
  runAgain: () => void;
}): { failure: WorkbenchFailure | null; retry: () => void } {
  const failure =
    workbenchFailure({
      save: save.error,
      run: run.error,
      result: result.error,
      test: test.error,
    }) ??
    (sandboxFailed
      ? { step: 'start' as const, reason: 'sandbox' as const }
      : null);
  const retry = () => {
    if (!failure) return;
    if (failure.step === 'save' && !run.error) retrySave();
    else if (failure.step === 'test') retryTest();
    else if (failure.step === 'result') retryResult();
    else if (failure.step === 'start') runAgain();
    else if (run.variables) retryRun();
    else runAgain();
  };
  return { failure, retry };
}
