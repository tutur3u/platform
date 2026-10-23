import {
  type DevboxPrivateSchemaClient,
  type DevboxStorageErrorLike,
  DevboxStoreError,
  getDevboxStorageError,
} from './store-utils';

export const DEVBOX_RUNNER_DRAINING_MESSAGE =
  'Runner is draining; it accepts only maintenance runs. Choose another runner.';

type SingleColumnQuery = {
  select: (columns: string) => {
    eq: (
      column: string,
      value: string
    ) => {
      limit: (count: number) => Promise<{
        data: Record<string, string | null>[] | null;
        error: DevboxStorageErrorLike;
      }>;
    };
  };
};

function isMissingDrainColumn(error: DevboxStorageErrorLike) {
  const normalized = error?.message?.toLowerCase() ?? '';
  return (
    normalized.includes('drain_requested_at') &&
    (normalized.includes('schema cache') ||
      normalized.includes('does not exist') ||
      normalized.includes('could not find'))
  );
}

async function selectColumn(
  client: DevboxPrivateSchemaClient,
  table: string,
  column: string,
  id: string
) {
  const { data, error } = await (client.from(table) as SingleColumnQuery)
    .select(column)
    .eq('id', id)
    .limit(1);
  return { error, value: data?.[0]?.[column] ?? null };
}

/**
 * A draining runner claims only maintenance, so any other run pinned to it
 * (directly or through an existing lease) would stay queued forever. Rejects
 * before writing anything; the database trigger
 * `reject_devbox_run_on_draining_runner` enforces the same rule for races.
 */
export async function assertDevboxRunnerAcceptsRun(
  client: DevboxPrivateSchemaClient,
  input: { leaseId?: string; runnerId?: string; workload?: string }
) {
  if ((input.workload ?? 'run') === 'maintenance') return;

  const runnerIds = new Set<string>();
  if (input.runnerId) runnerIds.add(input.runnerId);
  if (input.leaseId) {
    const lease = await selectColumn(
      client,
      'devbox_leases',
      'runner_id',
      input.leaseId
    );
    if (lease.error) throw getDevboxStorageError(lease.error);
    if (lease.value) runnerIds.add(lease.value);
  }

  for (const runnerId of runnerIds) {
    const runner = await selectColumn(
      client,
      'devbox_runners',
      'drain_requested_at',
      runnerId
    );
    // Production applies migrations after the app deploys.
    if (runner.error && isMissingDrainColumn(runner.error)) return;
    if (runner.error) throw getDevboxStorageError(runner.error);
    if (runner.value) {
      throw new DevboxStoreError(DEVBOX_RUNNER_DRAINING_MESSAGE, 409);
    }
  }
}
