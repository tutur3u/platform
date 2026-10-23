import { DatabaseSync } from 'node:sqlite';
import type { ActiveAssignment, Provider } from '../types';
import { t3StateDatabase } from './paths';

export interface T3SourceStatus {
  quotaSnapshotsFound: false;
  observedAt: string;
  activeAssignments: ActiveAssignment[];
  providerByInstance: Record<string, Provider>;
}

export function collectT3State(
  databasePath = t3StateDatabase()
): T3SourceStatus {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const byInstance = new Map<string, Provider>();
    const assignments = new Map<string, number>();
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
      if (row.provider === 'codex' || row.provider === 'claude')
        byInstance.set(row.provider_instance_id, row.provider);
    }
    const active = database
      .prepare(`
      SELECT provider_instance_id, COUNT(*) AS count
      FROM orchestration_v2_projection_subagents
      WHERE provider_instance_id IS NOT NULL AND status IN ('running', 'queued', 'starting')
      GROUP BY provider_instance_id
    `)
      .all() as Array<{ provider_instance_id: string; count: number }>;
    for (const row of active)
      assignments.set(row.provider_instance_id, row.count);
    const observed = database
      .prepare(
        'SELECT MAX(updated_at) AS observed_at FROM orchestration_v2_projection_provider_sessions'
      )
      .get() as { observed_at?: string } | undefined;
    return {
      quotaSnapshotsFound: false,
      observedAt: observed?.observed_at ?? new Date().toISOString(),
      activeAssignments: [...assignments.entries()].map(
        ([instanceId, count]) => ({ instanceId, count })
      ),
      providerByInstance: Object.fromEntries(byInstance),
    };
  } finally {
    database.close();
  }
}
