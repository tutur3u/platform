import { DatabaseSync } from 'node:sqlite';
import type { ActiveAssignment, Provider } from '../types';
import { t3StateDatabase } from './paths';
import { driverToProvider } from './provider';

export interface T3SourceStatus {
  quotaSnapshotsFound: false;
  observedAt: string;
  activeAssignments: ActiveAssignment[];
  referencedInstances?: string[];
  providerByInstance: Record<string, Provider>;
}

export function collectT3State(
  databasePath = t3StateDatabase()
): T3SourceStatus {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const byInstance = new Map<string, Provider>();
    const assignments = new Map<
      string,
      { count: number; reservationIds: string[] }
    >();
    const rows = database
      .prepare(`
      SELECT provider_instance_id, provider
      FROM orchestration_v2_projection_provider_sessions
      WHERE provider_instance_id IS NOT NULL
      UNION
      SELECT provider_instance_id, provider
      FROM orchestration_v2_projection_subagents
      WHERE provider_instance_id IS NOT NULL
    `)
      .all() as Array<{ provider_instance_id: string; provider: string }>;
    for (const row of rows) {
      const provider = driverToProvider(row.provider);
      if (provider) byInstance.set(row.provider_instance_id, provider);
    }
    const active = database
      .prepare(`
      SELECT provider_instance_id, COUNT(*) AS count, json_group_array(reservation_id) AS reservation_ids FROM (
        SELECT provider_instance_id, COALESCE(child_thread_id, provider_thread_id, subagent_id) AS reservation_id
        FROM orchestration_v2_projection_subagents
        WHERE provider_instance_id IS NOT NULL AND status IN ('pending', 'running', 'queued', 'starting', 'waiting')
        UNION
        SELECT provider_instance_id, thread_id AS reservation_id
        FROM orchestration_v2_projection_runs
        WHERE provider_instance_id IS NOT NULL AND status IN ('running', 'queued', 'preparing', 'starting', 'waiting')
          AND NOT (status = 'queued' AND json_extract(payload_json, '$.queueHeld') IS 1)
      ) GROUP BY provider_instance_id
    `)
      .all() as Array<{
      provider_instance_id: string;
      count: number;
      reservation_ids: string;
    }>;
    for (const row of active)
      assignments.set(row.provider_instance_id, {
        count: row.count,
        reservationIds: JSON.parse(row.reservation_ids),
      });

    let referencedInstances = [...assignments.keys()];
    try {
      const refs = database.prepare(`
        SELECT DISTINCT json_extract(payload_json, '$.providerInstanceId') AS id
        FROM orchestration_v2_projection_threads
        WHERE json_type(payload_json, '$.providerInstanceId') = 'text'
          AND COALESCE(json_extract(payload_json, '$.archived'), 0) = 0
          AND COALESCE(json_extract(payload_json, '$.settled'), 0) = 0
      `).all();
      referencedInstances = [...new Set([
        ...referencedInstances,
        ...refs.flatMap(({ id }) =>
          typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? [id] : []
        ),
      ])];
    } catch {
      // Older T3 projections can still report active assignments.
    }

    return {
      referencedInstances,
      quotaSnapshotsFound: false,
      observedAt: new Date().toISOString(),
      activeAssignments: [...assignments.entries()].map(
        ([instanceId, assignment]) => ({ instanceId, ...assignment })
      ),
      providerByInstance: Object.fromEntries(byInstance),
    };
  } finally {
    database.close();
  }
}
