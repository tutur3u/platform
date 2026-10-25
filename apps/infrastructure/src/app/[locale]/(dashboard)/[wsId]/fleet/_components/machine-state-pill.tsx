import { StatusPill } from '@tuturuuu/ui/custom/ops';
import {
  MACHINE_STATE_TONE,
  type MachineState,
} from '@/lib/fleet/machine-state';
import { RUN_STATE_TONE, type RunState } from '@/lib/fleet/run-state';
import type { FleetTranslator } from './fleet-data';

export function MachineStatePill({
  state,
  t,
}: {
  state: MachineState;
  t: FleetTranslator;
}) {
  return (
    <StatusPill tone={MACHINE_STATE_TONE[state]}>
      {t(`state.${state}`)}
    </StatusPill>
  );
}

export function RunStatePill({
  rawStatus,
  state,
  t,
}: {
  rawStatus: string;
  state: RunState;
  t: FleetTranslator;
}) {
  return (
    <StatusPill
      title={state === 'unrecognized' ? rawStatus : undefined}
      tone={RUN_STATE_TONE[state]}
    >
      {t(`run_state.${state}`)}
    </StatusPill>
  );
}
