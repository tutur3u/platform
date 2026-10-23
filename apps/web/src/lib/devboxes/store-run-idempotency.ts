import {
  createPrivateDevboxClient,
  type DevboxPrivateSchemaClient,
  type DevboxStorageErrorLike,
  DevboxStoreError,
  getDevboxStorageError,
} from './store-utils';

export const DEVBOX_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;

type KeyedRunQuery = {
  eq: (column: string, value: string) => KeyedRunQuery;
  limit: (count: number) => Promise<{
    data: unknown[] | null;
    error: DevboxStorageErrorLike;
  }>;
};

export interface KeyedDevboxRun {
  command: string[];
  exitCode: number | null;
  id: string;
  leaseId: string;
  status: string;
}

export function isMissingIdempotencyColumn(error: DevboxStorageErrorLike) {
  const message = error?.message?.toLowerCase() ?? '';
  return (
    message.includes('idempotency_key') &&
    (message.includes('schema cache') ||
      message.includes('does not exist') ||
      message.includes('could not find'))
  );
}

export function isUniqueViolation(error: DevboxStorageErrorLike) {
  return (
    (error as { code?: string } | null)?.code === '23505' ||
    (error?.message?.toLowerCase().includes('duplicate key') ?? false)
  );
}

// Before the idempotency migration applies there is no key column, so no run
// can be found by key; callers then behave as before (no dedupe).
export async function findDevboxRunByIdempotencyKey(
  client: DevboxPrivateSchemaClient,
  input: { actorId: string; idempotencyKey: string }
): Promise<KeyedDevboxRun | null> {
  const { data, error } = await (
    client.from('devbox_runs') as {
      select: (columns: string) => KeyedRunQuery;
    }
  )
    .select('id,status,command,exit_code,lease_id')
    .eq('actor_id', input.actorId)
    .eq('idempotency_key', input.idempotencyKey)
    .limit(1);
  if (error) {
    if (isMissingIdempotencyColumn(error)) return null;
    throw getDevboxStorageError(error);
  }
  const row = data?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    command: Array.isArray(row.command) ? row.command.map(String) : [],
    exitCode: typeof row.exit_code === 'number' ? row.exit_code : null,
    id: String(row.id),
    leaseId: String(row.lease_id ?? ''),
    status: String(row.status ?? ''),
  };
}

// A repeated key returns the run it already created. Reusing a key for a
// different command is a client bug, not a retry, so it is refused.
export function replayKeyedDevboxRun(run: KeyedDevboxRun, command: string[]) {
  if (run.command.join('\0') !== command.join('\0'))
    throw new DevboxStoreError(
      'Idempotency key was already used for a different command.',
      409
    );
  return {
    lease: { id: run.leaseId, status: 'active' },
    replayed: true,
    run: {
      command: run.command,
      exitCode: run.exitCode,
      id: run.id,
      status: run.status,
    },
  };
}

export async function stopDevboxRunByIdempotencyKey(
  input: { actorId: string; idempotencyKey: string },
  stop: (input: { actorId: string; runId: string }) => Promise<{
    message: string;
    status: string;
  }>
) {
  const run = await findDevboxRunByIdempotencyKey(
    await createPrivateDevboxClient(),
    input
  );
  if (!run)
    throw new DevboxStoreError('No devbox run exists for that key.', 404);
  return {
    ...(await stop({ actorId: input.actorId, runId: run.id })),
    runId: run.id,
  };
}
