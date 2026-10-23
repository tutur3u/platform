import {
  createPrivateDevboxClient,
  type DevboxPrivateSchemaClient,
  type DevboxStorageErrorLike,
  DevboxStoreError,
  getDevboxStorageError,
} from './store-utils';

export const DEVBOX_RUN_LOG_PAGE_SIZE = 1000;

type QueryResult = Promise<{
  data: unknown[] | null;
  error: DevboxStorageErrorLike;
}>;
type EventQuery = {
  eq: (column: string, value: string) => EventQuery;
  gt: (column: string, value: number) => EventQuery;
  order: (column: string, options?: { ascending?: boolean }) => EventQuery;
  limit: (count: number) => QueryResult;
  range: (from: number, to: number) => QueryResult;
};

function selectFrom(
  client: DevboxPrivateSchemaClient,
  table: string,
  columns: string
) {
  return (
    client.from(table) as { select: (columns: string) => EventQuery }
  ).select(columns);
}

function isMissingSeqColumn(error: DevboxStorageErrorLike) {
  const message = error?.message?.toLowerCase() ?? '';
  return (
    message.includes('seq') &&
    (message.includes('schema cache') ||
      message.includes('does not exist') ||
      message.includes('could not find'))
  );
}

function toLogs(rows: unknown[]) {
  return rows
    .map((row) =>
      row && typeof row === 'object' && 'message' in row
        ? String(row.message ?? '')
        : ''
    )
    .filter(Boolean);
}

// Pages run events by their per-run sequence. The sequence is allocated under
// a per-run lock held until commit, so once sequence N is visible every lower
// sequence is too: a cursor never skips an event that commits late. `next` is
// the last sequence returned; sequences are dense from 1, so it doubles as the
// raw-row offset older clients already send.
export async function listDevboxRunLogs(input: {
  actorId: string;
  offset?: number;
  runId: string;
}) {
  const cursor = input.offset ?? 0;
  const privateClient = await createPrivateDevboxClient();
  const owned = await selectFrom(privateClient, 'devbox_runs', 'id')
    .eq('id', input.runId)
    .eq('actor_id', input.actorId)
    .limit(1);
  if (owned.error) throw getDevboxStorageError(owned.error);
  if (!owned.data?.length)
    throw new DevboxStoreError('Devbox run not found.', 404);

  const sequenced = await selectFrom(
    privateClient,
    'devbox_run_events',
    'message,seq'
  )
    .eq('run_id', input.runId)
    .gt('seq', cursor)
    .order('seq', { ascending: true })
    .limit(DEVBOX_RUN_LOG_PAGE_SIZE);

  if (!sequenced.error) {
    const rows = sequenced.data ?? [];
    const last = rows.at(-1);
    const seq =
      last && typeof last === 'object' && 'seq' in last
        ? Number(last.seq)
        : Number.NaN;
    return {
      logs: toLogs(rows),
      next: Number.isSafeInteger(seq) && seq > cursor ? seq : cursor,
    };
  }
  if (!isMissingSeqColumn(sequenced.error))
    throw getDevboxStorageError(sequenced.error);

  // Before the cursor migration applies, keep the legacy timestamp offset.
  const legacy = await selectFrom(privateClient, 'devbox_run_events', 'message')
    .eq('run_id', input.runId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(cursor, cursor + DEVBOX_RUN_LOG_PAGE_SIZE - 1);
  if (legacy.error) throw getDevboxStorageError(legacy.error);
  const rows = legacy.data ?? [];
  return { logs: toLogs(rows), next: cursor + rows.length };
}
