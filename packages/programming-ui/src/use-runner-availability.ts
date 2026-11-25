import { useId, useState } from 'react';
import {
  errorCode,
  isRunnerUnavailable,
  type WorkbenchFailure,
} from './workbench-errors';
import type { SaveState } from './workbench-layout';
import type { RunnerAvailability, WorkbenchMeeting } from './workbench-meeting';

/**
 * Meetings only: once the runner refuses a run, Run stays disabled behind an
 * explanation instead of failing the same way on every click. When the host
 * app passes `runnerAvailability` the state is controlled there, so it survives
 * workbench remounts for that language; otherwise it is local.
 */
export function useRunnerAvailability(
  meeting:
    | Pick<WorkbenchMeeting, 'runnerAvailability' | 'onRunnerAvailability'>
    | undefined
) {
  const id = useId();
  const [local, setLocal] = useState<RunnerAvailability>('ready');
  const state = meeting?.runnerAvailability ?? local;
  const update = (next: RunnerAvailability) => {
    if (!meeting || next === state) return;
    setLocal(next);
    meeting.onRunnerAvailability?.(next);
  };
  return {
    refusal: meeting && state !== 'ready' ? { id, reason: state } : undefined,
    onRunError: (error: unknown) => {
      if (isRunnerUnavailable(error))
        update(
          errorCode(error) === 'PLAYGROUND_NOT_CONFIGURED'
            ? 'not_configured'
            : 'unavailable'
        );
    },
    onRunStarted: () => update('ready'),
  };
}

/**
 * Where the runner state applies: only a playground the person can run.
 * Problems run tests, so a refusal seen on an earlier playground never
 * reaches them. The card replaces only the refused run's notice; save,
 * result and test failures keep theirs. `saveFailed` covers both a failed
 * checkpoint and the save a retried run makes first, so the card never says
 * the code is saved when it is not.
 */
export function runnerGate(
  unavailable: string | undefined,
  playground: boolean,
  failure: WorkbenchFailure | null,
  save: SaveState = 'idle'
) {
  const id = playground ? unavailable : undefined;
  return {
    id,
    saveFailed: save === 'failed' || failure?.step === 'save',
    failure:
      id && failure?.step === 'run' && failure.reason === 'unavailable'
        ? null
        : failure,
  };
}
