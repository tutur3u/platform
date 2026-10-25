import type { MachineState } from './machine-state';

export type RunState =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'cancel_requested'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  /** Active on a machine we can no longer hear; never assumed failed. */
  | 'outcome_unknown'
  /** A status this console does not recognise. */
  | 'unrecognized';

const KNOWN_STATES = new Set<string>([
  'queued',
  'claimed',
  'running',
  'cancel_requested',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);

const ACTIVE_STATES = new Set<string>([
  'claimed',
  'running',
  'cancel_requested',
]);

export const TERMINAL_RUN_STATES: ReadonlySet<RunState> = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);

const UNREACHABLE_MACHINE_STATES = new Set<MachineState>([
  'disconnected',
  'revoked',
  'telemetry_late',
  'untrusted',
]);

export function getRunState(
  status: string,
  machineState: MachineState | null | undefined
): RunState {
  if (!KNOWN_STATES.has(status)) return 'unrecognized';
  if (
    ACTIVE_STATES.has(status) &&
    machineState &&
    UNREACHABLE_MACHINE_STATES.has(machineState)
  ) {
    return 'outcome_unknown';
  }
  return status as RunState;
}

export function isActiveRunStatus(status: string) {
  return status === 'queued' || ACTIVE_STATES.has(status);
}

export const RUN_STATE_TONE = {
  cancel_requested: 'warning',
  cancelled: 'neutral',
  claimed: 'info',
  failed: 'critical',
  outcome_unknown: 'unknown',
  queued: 'warning',
  running: 'info',
  succeeded: 'positive',
  timed_out: 'critical',
  unrecognized: 'unknown',
} as const satisfies Record<RunState, string>;
