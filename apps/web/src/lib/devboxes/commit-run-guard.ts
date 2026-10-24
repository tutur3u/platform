import {
  type DevboxPrivateSchemaClient,
  type DevboxStorageErrorLike,
  DevboxStoreError,
  getDevboxStorageError,
} from './store-utils';

export const COMMIT_RUN_ENVELOPE = '__ttr_commit_run_v1__';
export const COMMIT_RUN_PROTOCOL_VERSION = 1;

type RunnerQuery = {
  eq: (column: string, value: string) => RunnerQuery;
  limit: (count: number) => Promise<{
    data: Record<string, unknown>[] | null;
    error: DevboxStorageErrorLike;
  }>;
};

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Mirrors private.devbox_runner_supports_commit_run: a trusted-pool runner
 * (reported executionMode trusted, no Judge or playground feature) that
 * advertises this server's commit-run envelope version.
 */
export function runnerSupportsCommitRun(runner: {
  capabilities: unknown;
  enabled_features: unknown;
}) {
  const capabilities = record(runner.capabilities);
  const features = record(runner.enabled_features);
  const versions = record(capabilities.protocols).commitRun;
  return (
    capabilities.executionMode === 'trusted' &&
    features.judge !== true &&
    features.playground !== true &&
    Array.isArray(versions) &&
    versions.includes(COMMIT_RUN_PROTOCOL_VERSION)
  );
}

/**
 * A runner without the decoder would execute the envelope as a command, so a
 * commit run must be pinned to a runner that supports the protocol now. The
 * require_devbox_commit_run_runner trigger enforces the same rule against
 * races, and claims re-check it.
 */
export async function assertDevboxCommitRunRunner(
  client: DevboxPrivateSchemaClient,
  input: { command: string[]; leaseId?: string; runnerId?: string }
) {
  if (input.command[0] !== COMMIT_RUN_ENVELOPE) return;
  if (!input.runnerId || input.leaseId)
    throw new DevboxStoreError(
      'Commit runs must be pinned to a runner with runnerId and an automatic lease.',
      400
    );
  const { data, error } = await (
    client.from('devbox_runners') as {
      select: (columns: string) => RunnerQuery;
    }
  )
    .select('capabilities,enabled_features')
    .eq('id', input.runnerId)
    .limit(1);
  if (error) throw getDevboxStorageError(error);
  const runner = data?.[0];
  if (!runner || !runnerSupportsCommitRun(runner as never))
    throw new DevboxStoreError(
      'Runner does not support the commit-run protocol; choose a runner that advertises it.',
      409
    );
}

/** Heartbeats keep a protocol advertisement only from trusted-mode reports. */
export function restrictReportedProtocols<
  T extends { executionMode?: string; protocols?: unknown },
>(capabilities: T | undefined): T | undefined {
  if (!capabilities?.protocols || capabilities.executionMode === 'trusted')
    return capabilities;
  const { protocols: _dropped, ...rest } = capabilities;
  return rest as T;
}
