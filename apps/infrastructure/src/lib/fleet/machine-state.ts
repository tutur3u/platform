import type { DevboxRunnerControl } from '@/lib/devboxes/admin-runner-control';
import type { DevboxAdminRunner } from '@/lib/devboxes/admin-store';

/** Matches placement freshness (`DEVBOX_HEARTBEAT_FRESH_MS` in the SDK). */
export const FRESH_HEARTBEAT_MS = 60 * 1000;
export const DISCONNECTED_HEARTBEAT_MS = 15 * 60 * 1000;
/** Resource figures older than this are shown as unknown, not current. */
export const FRESH_TELEMETRY_MS = 5 * 60 * 1000;

/**
 * One derived state per machine, in precedence order: the first state that
 * applies is the one an operator has to act on.
 */
export type MachineState =
  | 'revoked'
  | 'untrusted'
  | 'awaiting_first_heartbeat'
  | 'disconnected'
  | 'telemetry_late'
  | 'heartbeat_disabled'
  | 'draining'
  | 'online';

export type MachineTrust = 'trusted' | 'no_active_credential' | 'revoked';

export type TelemetryFreshness = 'fresh' | 'stale' | 'missing';

export interface MachineTokenCounts {
  active: number;
  total: number;
}

export interface MachineStateInput {
  control?: Partial<Pick<DevboxRunnerControl, 'drain_requested_at'>> | null;
  now: Date;
  runner: Pick<
    DevboxAdminRunner,
    'heartbeat_enabled' | 'last_heartbeat_at' | 'status'
  >;
  telemetryReportedAt: string | null;
  tokens: MachineTokenCounts;
}

export interface MachineStatus {
  heartbeatAgeMs: number | null;
  state: MachineState;
  telemetry: TelemetryFreshness;
  trust: MachineTrust;
}

function ageMs(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(now.getTime() - time, 0);
}

export function getTelemetryFreshness(
  reportedAt: string | null,
  now: Date
): TelemetryFreshness {
  const age = ageMs(reportedAt, now);
  if (age === null) return 'missing';
  return age <= FRESH_TELEMETRY_MS ? 'fresh' : 'stale';
}

export function getMachineTrust(
  status: string,
  tokens: MachineTokenCounts
): MachineTrust {
  if (status === 'revoked') return 'revoked';
  return tokens.active > 0 ? 'trusted' : 'no_active_credential';
}

export function getMachineStatus({
  control,
  now,
  runner,
  telemetryReportedAt,
  tokens,
}: MachineStateInput): MachineStatus {
  const heartbeatAgeMs = ageMs(runner.last_heartbeat_at, now);
  const trust = getMachineTrust(runner.status, tokens);
  const heartbeatFresh =
    heartbeatAgeMs !== null && heartbeatAgeMs <= FRESH_HEARTBEAT_MS;
  // Fresh resource numbers from a machine we cannot currently hear are not
  // current, so telemetry is only fresh while the heartbeat is.
  const telemetry =
    heartbeatFresh || telemetryReportedAt === null
      ? getTelemetryFreshness(telemetryReportedAt, now)
      : 'stale';

  const state = ((): MachineState => {
    if (trust === 'revoked') return 'revoked';
    if (trust === 'no_active_credential') return 'untrusted';
    if (heartbeatAgeMs === null) return 'awaiting_first_heartbeat';
    if (!runner.heartbeat_enabled) return 'heartbeat_disabled';
    if (heartbeatAgeMs > DISCONNECTED_HEARTBEAT_MS) return 'disconnected';
    if (!heartbeatFresh || runner.status !== 'online') return 'telemetry_late';
    if (control?.drain_requested_at) return 'draining';
    return 'online';
  })();

  return { heartbeatAgeMs, state, telemetry, trust };
}

export const MACHINE_STATE_TONE = {
  awaiting_first_heartbeat: 'warning',
  disconnected: 'critical',
  draining: 'info',
  heartbeat_disabled: 'neutral',
  online: 'positive',
  revoked: 'neutral',
  telemetry_late: 'unknown',
  untrusted: 'critical',
} as const satisfies Record<MachineState, string>;

/** States that need an operator before the machine can take work. */
export const MACHINE_ATTENTION_STATES: ReadonlySet<MachineState> = new Set([
  'awaiting_first_heartbeat',
  'disconnected',
  'telemetry_late',
  'untrusted',
]);
