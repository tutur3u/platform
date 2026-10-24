import {
  createPrivateDevboxClient,
  type DevboxPrivateSchemaClient,
  getDevboxStorageError,
} from './store-utils';

export interface DevboxRunnerActivity {
  queued_runs: number;
  running_runs: number;
  // Unexpired, non-kept leases; these must reach zero before `drained`.
  active_leases: number;
  // Kept (persistent) leases survive a drain and never block `drained`;
  // release them separately before retiring the runner.
  kept_leases: number;
}
export interface DevboxRunnerControl {
  drain_requested_at: string | null;
  // Null when the drain/activity migration has not been applied yet.
  activity: DevboxRunnerActivity | null;
  drained: boolean | null;
}

type ActivityRow = {
  runner_id: string;
  queued_runs: number | string;
  running_runs: number | string;
  active_leases: number | string;
  // Absent before migration 20261023103000.
  kept_leases?: number | string | null;
};

/** Requests or clears a drain; the RPC also cancels/requeues pinned work. */
export async function setDevboxRunnerDrain(
  runnerId: string,
  draining: boolean
) {
  const client = await createPrivateDevboxClient();
  const { data, error } = await client.rpc<string | null>(
    'set_devbox_runner_drain',
    { p_draining: draining, p_runner_id: runnerId }
  );
  if (error) throw getDevboxStorageError(error);
  return { drain_requested_at: data ?? null };
}

// Production applies migrations after the app deploys, so a missing column or
// function degrades to unknown activity instead of failing the snapshot.
export async function listDevboxRunnerControl(
  client: DevboxPrivateSchemaClient
): Promise<Map<string, DevboxRunnerControl>> {
  const control = new Map<string, DevboxRunnerControl>();
  const [drainResult, activityResult] = await Promise.all([
    (
      client.from('devbox_runners') as {
        select: (columns: string) => {
          neq: (
            column: string,
            value: string
          ) => Promise<{
            data: { id: string; drain_requested_at: string | null }[] | null;
            error: { message?: string } | null;
          }>;
        };
      }
    )
      .select('id,drain_requested_at')
      .neq('status', 'revoked'),
    client.rpc<ActivityRow[]>('devbox_runner_activity'),
  ]);
  if (drainResult.error || activityResult.error) return control;
  const activity = new Map(
    (activityResult.data ?? []).map((row) => [
      row.runner_id,
      {
        queued_runs: Number(row.queued_runs),
        running_runs: Number(row.running_runs),
        active_leases: Number(row.active_leases),
        kept_leases: Number(row.kept_leases ?? 0),
      },
    ])
  );
  for (const row of drainResult.data ?? []) {
    const counts = activity.get(row.id) ?? null;
    control.set(row.id, {
      drain_requested_at: row.drain_requested_at,
      activity: counts,
      drained:
        row.drain_requested_at && counts
          ? counts.queued_runs === 0 &&
            counts.running_runs === 0 &&
            counts.active_leases === 0
          : false,
    });
  }
  return control;
}
