import { useId, useState } from 'react';
import { isRunnerUnavailable, type WorkbenchFailure } from './workbench-errors';

export type RunnerAvailability = 'ready' | 'unavailable';

/**
 * Meetings only: once the runner refuses a run, Run stays disabled behind an
 * explanation instead of failing the same way on every click. When the host
 * app passes `runnerUnavailable` the state is controlled there, so it survives
 * workbench remounts (a language switch) for the call; otherwise it is local.
 */
export function useRunnerAvailability(
  meeting:
    | {
        runnerUnavailable?: boolean;
        onRunnerUnavailable?: (unavailable: boolean) => void;
      }
    | undefined
) {
  const id = useId();
  const [local, setLocal] = useState<RunnerAvailability>('ready');
  const controlled = meeting?.runnerUnavailable;
  const state: RunnerAvailability =
    controlled === undefined ? local : controlled ? 'unavailable' : 'ready';
  const update = (next: RunnerAvailability) => {
    if (!meeting || next === state) return;
    setLocal(next);
    meeting.onRunnerUnavailable?.(next === 'unavailable');
  };
  return {
    /** The explanation card's id while runs are unavailable, for aria-describedby. */
    unavailable: meeting && state === 'unavailable' ? id : undefined,
    onRunError: (error: unknown) => {
      if (isRunnerUnavailable(error)) update('unavailable');
    },
    onRunStarted: () => update('ready'),
  };
}

/**
 * Where the runner state applies: only a playground the person can run.
 * Problems run tests, so a refusal seen on an earlier playground never
 * reaches them. The card replaces only the refused run's notice; save,
 * result and test failures keep theirs.
 */
export function runnerGate(
  unavailable: string | undefined,
  playground: boolean,
  failure: WorkbenchFailure | null
) {
  const id = playground ? unavailable : undefined;
  return {
    id,
    failure:
      id && failure?.step === 'run' && failure.reason === 'unavailable'
        ? null
        : failure,
  };
}
