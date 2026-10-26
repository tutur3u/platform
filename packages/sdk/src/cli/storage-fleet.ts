import {
  DEVBOX_HEARTBEAT_FRESH_MS,
  type DevboxFleetSnapshot,
  fleetSnapshotNow,
} from '../devbox-fleet-types';
import {
  capabilityPressure,
  type DiskCapability,
  parseDiskCapability,
  type StorageThresholds,
} from './storage-headroom';

export interface FleetStorageRow {
  id: string;
  name: string;
  host: string | null;
  platform: string | null;
  status: string;
  lastHeartbeatAt: string | null;
  disk: DiskCapability | null;
  /**
   * `unknown`: offline, heartbeat disabled or older than the freshness window,
   * so its last disk report is not evidence of anything. Never healthy.
   */
  pressure: 'ok' | 'low' | 'critical' | 'unreported' | 'unknown';
  reasons: string[];
}

/**
 * Disk headroom per registered runner, read only from the authenticated
 * heartbeat capabilities (`resources.disk`) in the fleet snapshot. A host
 * that is not reporting fresh heartbeats is UNKNOWN; nothing here reaches a
 * host directly. No new transport, timer or controller.
 */
export function fleetStorage(
  snapshot: DevboxFleetSnapshot,
  thresholds: StorageThresholds,
  now = fleetSnapshotNow(snapshot)
): FleetStorageRow[] {
  const rank = { critical: 0, unknown: 1, low: 2, ok: 3, unreported: 4 };
  return snapshot.runners
    .filter((runner) => runner.status !== 'revoked')
    .map((runner): FleetStorageRow => {
      const resources = runner.capabilities?.resources;
      const disk =
        resources && typeof resources === 'object' && !Array.isArray(resources)
          ? parseDiskCapability((resources as { disk?: unknown }).disk)
          : null;
      const age = now - Date.parse(runner.last_heartbeat_at ?? '');
      const fresh =
        runner.status === 'online' &&
        runner.heartbeat_enabled &&
        Number.isFinite(age) &&
        age >= 0 &&
        age < DEVBOX_HEARTBEAT_FRESH_MS;
      const verdict =
        disk && fresh ? capabilityPressure(disk, thresholds) : null;
      return {
        id: runner.id,
        name: runner.name,
        host: runner.capabilities?.os?.hostname ?? null,
        platform: runner.capabilities?.os?.platform ?? null,
        status: runner.status,
        lastHeartbeatAt: runner.last_heartbeat_at,
        disk,
        pressure: !fresh ? 'unknown' : (verdict?.pressure ?? 'unreported'),
        reasons: fresh
          ? (verdict?.reasons ?? [])
          : [
              `${runner.status}, last heartbeat ${runner.last_heartbeat_at ?? 'never'} (fresh within ${DEVBOX_HEARTBEAT_FRESH_MS / 1000}s); disk state unknown`,
            ],
      };
    })
    .sort((a, b) => rank[a.pressure] - rank[b.pressure]);
}

export function renderFleetStorage(rows: FleetStorageRow[]) {
  if (!rows.length) return 'No registered runners.';
  return rows
    .map((row) => {
      const disk =
        row.pressure === 'unknown'
          ? 'UNKNOWN: no fresh heartbeat, last report is not trusted'
          : row.disk
            ? `>=${row.disk.freeGiB}GiB free (>=${row.disk.freePct}%)${row.disk.inodeFreePct == null ? '' : `, inodes >=${row.disk.inodeFreePct}%`}`
            : 'disk not reported (agent predates ttr storage)';
      const flag =
        row.pressure === 'critical' ? ' LOW-DISK: skipped by offload' : '';
      return `${row.pressure.toUpperCase().padEnd(10)} ${row.name} (${row.id}) ${row.host ?? '-'} ${row.status}, heartbeat ${row.lastHeartbeatAt ?? 'never'}: ${disk}${flag}${row.reasons.length ? ` — ${row.reasons.join('; ')}` : ''}`;
    })
    .join('\n');
}
