import {
  createInternalApiClient,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';

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
    [key: string]: unknown;
  } | null;
}
export interface DevboxFleetSnapshot {
  runners: DevboxFleetRunner[];
  runs: { id: string; runner_id: string | null; status: string }[];
  leases: { id: string; runner_id: string | null; status: string }[];
}

/** Uses the existing root-member Infrastructure authorization boundary. */
export class DevboxFleetClient {
  private readonly api;
  constructor(options: InternalApiClientOptions) {
    this.api = createInternalApiClient(options);
  }
  snapshot() {
    return this.api.json<DevboxFleetSnapshot>(
      '/api/v1/infrastructure/devboxes'
    );
  }
}

export function getInfrastructureOrigin(baseUrl: string) {
  const url = new URL(baseUrl);
  if (url.hostname === 'tuturuuu.com')
    return 'https://infrastructure.tuturuuu.com';
  if (url.hostname === 'tuturuuu.localhost')
    return `${url.protocol}//infra.tuturuuu.localhost${url.port ? `:${url.port}` : ''}`;
  if (
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    url.port === '7803'
  ) {
    url.port = '7823';
    return url.origin;
  }
  // Custom deployments must explicitly point their client at their own server.
  // Never redirect a custom deployment's credentials to the hosted platform.
  return url.origin;
}

export function runnerMaintenanceBlocker(
  snapshot: DevboxFleetSnapshot,
  runner: DevboxFleetRunner,
  now = Date.now()
) {
  const age = now - Date.parse(runner.last_heartbeat_at ?? '');
  if (
    runner.status !== 'online' ||
    !Number.isFinite(age) ||
    age < 0 ||
    age >= 60_000
  )
    return 'Runner is offline or its heartbeat is stale';
  const host = runner.capabilities?.os?.hostname;
  const peers = snapshot.runners
    .filter(
      (row) =>
        row.id === runner.id ||
        (host && row.capabilities?.os?.hostname === host)
    )
    .map((row) => row.id);
  if (
    snapshot.runs.some(
      (run) =>
        run.runner_id &&
        peers.includes(run.runner_id) &&
        ['queued', 'claimed', 'running'].includes(run.status)
    ) ||
    snapshot.leases.some(
      (lease) =>
        lease.runner_id &&
        peers.includes(lease.runner_id) &&
        lease.status === 'active'
    )
  )
    return 'Runner or another runner on its host has an active lease or unfinished work';
  // The admin snapshot is bounded. A full page cannot establish idleness.
  if (
    snapshot.runners.length >= 50 ||
    snapshot.runs.length >= 50 ||
    snapshot.leases.length >= 50
  )
    return 'Snapshot is truncated; inspect the runner before maintenance';
  return undefined;
}
