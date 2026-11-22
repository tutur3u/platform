import { useId, useState } from 'react';
import { isRunnerUnavailable } from './workbench-errors';

export type RunnerAvailability = 'ready' | 'unavailable';

/**
 * Meetings only: once the runner refuses a run, Run stays disabled behind an
 * explanation instead of failing the same way on every click. The host app can
 * hold the state across workbench remounts (a language switch) for the call.
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
  const [state, setState] = useState<RunnerAvailability>(
    meeting?.runnerUnavailable ? 'unavailable' : 'ready'
  );
  const update = (next: RunnerAvailability) => {
    if (!meeting || next === state) return;
    setState(next);
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
