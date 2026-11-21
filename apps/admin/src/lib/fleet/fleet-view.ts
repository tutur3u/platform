import type {
  DevboxAdminRun,
  DevboxAdminRunner,
  DevboxControlSnapshot,
} from '@/lib/devboxes/admin-store';
import {
  getMachineStatus,
  MACHINE_ATTENTION_STATES,
  type MachineState,
  type MachineStatus,
} from './machine-state';
import { getRunState, type RunState } from './run-state';
import { type MachineTelemetry, parseMachineTelemetry } from './telemetry';

export interface MachineActivity {
  activeLeases: number;
  keptLeases: number;
  queuedRuns: number;
  runningRuns: number;
}

export interface MachineView {
  /** Null until the drain/activity migration is applied. */
  activity: MachineActivity | null;
  drainRequestedAt: string | null;
  features: Record<string, boolean>;
  heartbeatEnabled: boolean;
  id: string;
  lastHeartbeatAt: string | null;
  name: string;
  rawStatus: string;
  runner: DevboxAdminRunner;
  status: MachineStatus;
  telemetry: MachineTelemetry;
  tokens: { active: number; total: number };
}

export interface FleetRunView {
  machineName: string | null;
  run: DevboxAdminRun;
  state: RunState;
}

export interface FleetView {
  attention: MachineView[];
  counts: {
    attention: number;
    machines: number;
    online: number;
    outcomeUnknown: number;
    queued: number;
    revoked: number;
    running: number;
    /** Run counts cover only this many most recent runs. */
    runWindow: number;
  };
  machines: MachineView[];
  runs: FleetRunView[];
}

const STATE_ORDER: MachineState[] = [
  'untrusted',
  'disconnected',
  'awaiting_first_heartbeat',
  'telemetry_late',
  'draining',
  'online',
  'heartbeat_disabled',
  'revoked',
];

export function buildMachineView(
  runner: DevboxAdminRunner,
  snapshot: Pick<DevboxControlSnapshot, 'runnerTokens'>,
  now: Date
): MachineView {
  const telemetry = parseMachineTelemetry(runner.capabilities);
  const tokens = snapshot.runnerTokens.filter(
    (token) => token.runner_id === runner.id
  );
  const tokenCounts = {
    active: tokens.filter((token) => !token.revoked_at).length,
    total: tokens.length,
  };
  const activity = runner.activity
    ? {
        activeLeases: runner.activity.active_leases,
        keptLeases: runner.activity.kept_leases,
        queuedRuns: runner.activity.queued_runs,
        runningRuns: runner.activity.running_runs,
      }
    : null;

  return {
    activity,
    drainRequestedAt: runner.drain_requested_at ?? null,
    features: runner.enabled_features ?? {},
    heartbeatEnabled: runner.heartbeat_enabled,
    id: runner.id,
    lastHeartbeatAt: runner.last_heartbeat_at,
    name: runner.name,
    rawStatus: runner.status,
    runner,
    status: getMachineStatus({
      control: runner,
      now,
      runner,
      telemetryReportedAt: telemetry.reportedAt,
      tokens: tokenCounts,
    }),
    telemetry,
    tokens: tokenCounts,
  };
}

export function buildFleetView(
  snapshot: DevboxControlSnapshot,
  now: Date
): FleetView {
  const machines = snapshot.runners
    .map((runner) => buildMachineView(runner, snapshot, now))
    .sort(
      (a, b) =>
        STATE_ORDER.indexOf(a.status.state) -
          STATE_ORDER.indexOf(b.status.state) || a.name.localeCompare(b.name)
    );
  const byId = new Map(machines.map((machine) => [machine.id, machine]));
  const runs = snapshot.runs.map((run) => {
    const machine = run.runner_id ? byId.get(run.runner_id) : undefined;
    return {
      machineName: machine?.name ?? null,
      run,
      state: getRunState(run.status, machine?.status.state),
    };
  });
  const attention = machines.filter((machine) =>
    MACHINE_ATTENTION_STATES.has(machine.status.state)
  );

  return {
    attention,
    counts: {
      attention: attention.length,
      machines: machines.filter((m) => m.status.state !== 'revoked').length,
      online: machines.filter((m) => m.status.state === 'online').length,
      outcomeUnknown: runs.filter((r) => r.state === 'outcome_unknown').length,
      queued: runs.filter((r) => r.state === 'queued').length,
      revoked: machines.filter((m) => m.status.state === 'revoked').length,
      running: runs.filter(
        (r) => r.state === 'running' || r.state === 'claimed'
      ).length,
      runWindow: runs.length,
    },
    machines,
    runs,
  };
}
