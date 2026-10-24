// Dependency-free fleet types and eligibility, shared by the authenticated
// fleet client and the lightweight `ttr resources` entry (which must not load
// the internal API client).
/** Capability reports remain extensible as platform-owned services evolve. */
export interface DevboxFleetRunner {
  id: string;
  name: string;
  status: string;
  last_heartbeat_at: string | null;
  heartbeat_enabled: boolean;
  enabled_features: Record<string, boolean> | null;
  resource_limits: Record<string, number> | null;
  capabilities: {
    cli?: { version?: string };
    os?: { hostname?: string; platform?: string; arch?: string };
    executionMode?: string;
    protocols?: { commitRun?: unknown };
    [key: string]: unknown;
  } | null;
  // Present once the trust-pool/drain migration is live; null before that.
  drain_requested_at?: string | null;
  activity?: {
    queued_runs: number;
    running_runs: number;
    active_leases: number;
  } | null;
  drained?: boolean | null;
}

export type DevboxRunnerBlocker =
  | 'offline'
  | 'stale_heartbeat'
  | 'draining'
  | 'capability_missing'
  | 'trust_cap';
export const DEVBOX_HEARTBEAT_FRESH_MS = 60_000;
/** Commit-run envelope version `ttr resources --offload` submits. */
export const COMMIT_RUN_PROTOCOL_VERSION = 1;

/** Whether the runner advertises it can decode this client's envelope. */
export function runnerSupportsCommitRun(runner: DevboxFleetRunner) {
  const versions = runner.capabilities?.protocols?.commitRun;
  return (
    Array.isArray(versions) && versions.includes(COMMIT_RUN_PROTOCOL_VERSION)
  );
}

/**
 * Trusted-work eligibility from the client side. `status` alone is not
 * freshness: it stays "online" after an agent stops heartbeating. Runners
 * must be fresh, not draining, run-enabled, carry no Judge/playground role,
 * attest `executionMode: trusted` (trust cap), and advertise the commit-run
 * protocol this client submits.
 */
export function evaluateTrustedRunner(
  runner: DevboxFleetRunner,
  now = Date.now()
): { eligible: boolean; blockedBy?: DevboxRunnerBlocker; reason: string } {
  const age = now - Date.parse(runner.last_heartbeat_at ?? '');
  if (runner.status !== 'online' || !runner.heartbeat_enabled)
    return {
      eligible: false,
      blockedBy: 'offline',
      reason: 'runner is offline or its heartbeat is disabled',
    };
  if (!Number.isFinite(age) || age < 0 || age >= DEVBOX_HEARTBEAT_FRESH_MS)
    return {
      eligible: false,
      blockedBy: 'stale_heartbeat',
      reason: `last heartbeat ${runner.last_heartbeat_at ?? 'never'} is older than ${DEVBOX_HEARTBEAT_FRESH_MS / 1000}s; treated as offline`,
    };
  if (runner.drain_requested_at)
    return {
      eligible: false,
      blockedBy: 'draining',
      reason: 'runner is draining',
    };
  const features = runner.enabled_features;
  const mode = runner.capabilities?.executionMode;
  // Role first: a Judge/playground identity is never trusted-work capable.
  if (
    features?.judge === true ||
    features?.playground === true ||
    (mode !== undefined && mode !== 'trusted')
  )
    return {
      eligible: false,
      blockedBy: 'trust_cap',
      reason: 'runner is a Judge/playground identity, not trusted development',
    };
  if (features?.run !== true)
    return {
      eligible: false,
      blockedBy: 'capability_missing',
      reason: 'run capability is not enabled for this runner',
    };
  if (mode !== 'trusted')
    return {
      eligible: false,
      blockedBy: 'trust_cap',
      reason:
        'runner does not attest executionMode=trusted (enable TUTURUUU_DEVBOX_REPORT_EXECUTION_MODE on the runner)',
    };
  // Fail closed: a runner without the decoder would treat the envelope as a
  // command, so offload requires the advertised protocol, not a CLI version.
  if (!runnerSupportsCommitRun(runner))
    return {
      eligible: false,
      blockedBy: 'capability_missing',
      reason: `runner does not advertise commit-run protocol v${COMMIT_RUN_PROTOCOL_VERSION} (upgrade ttr on the runner)`,
    };
  return { eligible: true, reason: 'fresh trusted-development runner' };
}

export interface DevboxFleetSnapshot {
  /** Server-reported generation time, when the server provides one. */
  generated_at?: string;
  /** Server clock for this snapshot (`generated_at` or the `Date` header). */
  server_time?: string;
  runners: DevboxFleetRunner[];
  runs: { id: string; runner_id: string | null; status: string }[];
  leases: { id: string; runner_id: string | null; status: string }[];
}

/**
 * The server's clock for a snapshot. Heartbeats are server timestamps, so
 * comparing them with a skewed local clock would misjudge freshness; the local
 * clock is only a fallback for servers that send neither field.
 */
export function fleetSnapshotNow(
  snapshot: Pick<DevboxFleetSnapshot, 'generated_at' | 'server_time'>,
  fallback = Date.now()
) {
  const now = Date.parse(snapshot.server_time ?? snapshot.generated_at ?? '');
  return Number.isFinite(now) ? now : fallback;
}
