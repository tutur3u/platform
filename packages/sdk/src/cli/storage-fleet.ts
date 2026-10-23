import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
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
  pressure: 'ok' | 'low' | 'critical' | 'unreported';
  reasons: string[];
}

/**
 * Disk headroom per registered runner, read from the existing heartbeat
 * capabilities (`resources.disk`). No new transport, timer or controller.
 */
export function fleetStorage(
  snapshot: DevboxFleetSnapshot,
  thresholds: StorageThresholds
): FleetStorageRow[] {
  const rank = { critical: 0, low: 1, ok: 2, unreported: 3 };
  return snapshot.runners
    .filter((runner) => runner.status !== 'revoked')
    .map((runner): FleetStorageRow => {
      const resources = runner.capabilities?.resources;
      const disk =
        resources && typeof resources === 'object' && !Array.isArray(resources)
          ? parseDiskCapability((resources as { disk?: unknown }).disk)
          : null;
      const verdict = disk ? capabilityPressure(disk, thresholds) : null;
      return {
        id: runner.id,
        name: runner.name,
        host: runner.capabilities?.os?.hostname ?? null,
        platform: runner.capabilities?.os?.platform ?? null,
        status: runner.status,
        lastHeartbeatAt: runner.last_heartbeat_at,
        disk,
        pressure: verdict?.pressure ?? 'unreported',
        reasons: verdict?.reasons ?? [],
      };
    })
    .sort((a, b) => rank[a.pressure] - rank[b.pressure]);
}

export function renderFleetStorage(rows: FleetStorageRow[]) {
  if (!rows.length) return 'No registered runners.';
  return rows
    .map((row) => {
      const disk = row.disk
        ? `>=${row.disk.freeGiB}GiB free (>=${row.disk.freePct}%)${row.disk.inodeFreePct == null ? '' : `, inodes >=${row.disk.inodeFreePct}%`}`
        : 'disk not reported (agent predates ttr storage)';
      const flag =
        row.pressure === 'critical' ? ' LOW-DISK: skipped by offload' : '';
      return `${row.pressure.toUpperCase().padEnd(10)} ${row.name} (${row.id}) ${row.host ?? '-'} ${row.status}, heartbeat ${row.lastHeartbeatAt ?? 'never'}: ${disk}${flag}${row.reasons.length ? ` — ${row.reasons.join('; ')}` : ''}`;
    })
    .join('\n');
}
