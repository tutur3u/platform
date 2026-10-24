import {
  createInternalApiClient,
  type InternalApiClientOptions,
  InternalApiError,
} from '@tuturuuu/internal-api/client';

export {
  DEVBOX_HEARTBEAT_FRESH_MS,
  type DevboxFleetRunner,
  type DevboxFleetSnapshot,
  type DevboxRunnerBlocker,
  evaluateTrustedRunner,
  fleetSnapshotNow,
} from './devbox-fleet-types';

import type {
  DevboxFleetRunner,
  DevboxFleetSnapshot,
} from './devbox-fleet-types';

/** Uses the existing root-member Infrastructure authorization boundary. */
export class DevboxFleetClient {
  private readonly api;
  constructor(options: InternalApiClientOptions) {
    this.api = createInternalApiClient(options);
  }
  /**
   * Stamps `server_time` from the server's `generated_at` (when present) or
   * the response `Date` header, so heartbeat freshness never depends on the
   * caller's clock.
   */
  async snapshot(
    options: { signal?: AbortSignal } = {}
  ): Promise<DevboxFleetSnapshot> {
    const response = await this.api.fetch('/api/v1/infrastructure/devboxes', {
      signal: options.signal,
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        message?: string;
      };
      throw new InternalApiError(
        data.message ||
          data.error ||
          `Internal API request failed: ${response.status}`,
        response.status,
        data.code
      );
    }
    const body = (await response.json()) as DevboxFleetSnapshot;
    const date = Date.parse(response.headers.get('date') ?? '');
    const serverTime =
      body.generated_at ??
      (Number.isFinite(date) ? new Date(date).toISOString() : undefined);
    return serverTime ? { ...body, server_time: serverTime } : body;
  }
  /** Root admin only; the server enforces trust-pool exclusion. */
  setFeature(runnerId: string, feature: string, enabled: boolean) {
    return this.api.json<{
      runnerId: string;
      feature: string;
      enabled: boolean;
    }>(
      `/api/v1/infrastructure/devboxes/runners/${encodeURIComponent(runnerId)}/features`,
      {
        body: JSON.stringify({ feature, enabled }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );
  }
  setDrain(runnerId: string, draining: boolean) {
    return this.api.json<{
      runnerId: string;
      drain_requested_at: string | null;
    }>(
      `/api/v1/infrastructure/devboxes/runners/${encodeURIComponent(runnerId)}/drain`,
      {
        body: JSON.stringify({ draining }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
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
  const host = runner.capabilities?.os?.hostname?.trim();
  if (!host)
    return 'Runner does not report a hostname; host idleness cannot be established';
  const peers = snapshot.runners
    .filter(
      (row) =>
        row.id === runner.id ||
        (host && row.capabilities?.os?.hostname?.trim() === host)
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
