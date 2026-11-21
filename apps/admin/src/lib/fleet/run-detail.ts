import type { DevboxAdminRun } from '@/lib/devboxes/admin-store';
import {
  createPrivateDevboxClient,
  type DevboxStorageErrorLike,
  getDevboxStorageError,
} from '@/lib/devboxes/store-utils';

export const RUN_LOG_LIMIT = 500;

// env and env_files are deliberately never selected: they can carry secrets.
const RUN_COLUMNS =
  'id,actor_id,lease_id,runner_id,status,command,preview_ports,timeout_seconds,exit_code,started_at,completed_at,created_at,updated_at';

export interface FleetRunEvent {
  created_at: string;
  event_type: string;
  id: string;
  message: string | null;
  seq?: number | null;
}

export interface FleetRunDetail {
  events: FleetRunEvent[];
  /** True when older events exist beyond {@link RUN_LOG_LIMIT}. */
  eventsTruncated: boolean;
  run: DevboxAdminRun;
}

type Result<T> = Promise<{ data: T[] | null; error: DevboxStorageErrorLike }>;

type Query<T> = {
  eq: (column: string, value: string) => Query<T>;
  limit: (count: number) => Result<T>;
  order: (column: string, options: { ascending: boolean }) => Query<T>;
};

type Table<T> = { select: (columns: string) => Query<T> };

function isMissingSeq(error: DevboxStorageErrorLike) {
  const message = error?.message?.toLowerCase() ?? '';
  return message.includes('seq') && message.includes('column');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns null for an unknown or malformed run id. Storage errors throw. */
export async function getFleetRunDetail(
  runId: string
): Promise<FleetRunDetail | null> {
  if (!UUID.test(runId)) return null;

  const client = await createPrivateDevboxClient();
  const runs = client.from('devbox_runs') as Table<DevboxAdminRun>;
  const events = () => client.from('devbox_run_events') as Table<FleetRunEvent>;

  const runResult = await runs.select(RUN_COLUMNS).eq('id', runId).limit(1);
  if (runResult.error) throw getDevboxStorageError(runResult.error);
  const run = runResult.data?.[0];
  if (!run) return null;

  // Newest first so the limit keeps the tail of a long log.
  let eventResult = await events()
    .select('id,run_id,event_type,message,created_at,seq')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(RUN_LOG_LIMIT + 1);
  if (eventResult.error && isMissingSeq(eventResult.error)) {
    eventResult = await events()
      .select('id,run_id,event_type,message,created_at')
      .eq('run_id', runId)
      .order('created_at', { ascending: false })
      .limit(RUN_LOG_LIMIT + 1);
  }
  if (eventResult.error) throw getDevboxStorageError(eventResult.error);

  const rows = eventResult.data ?? [];
  const kept = rows.slice(0, RUN_LOG_LIMIT);
  kept.sort(
    (a, b) =>
      (a.seq ?? 0) - (b.seq ?? 0) || a.created_at.localeCompare(b.created_at)
  );

  return {
    events: kept,
    eventsTruncated: rows.length > RUN_LOG_LIMIT,
    run,
  };
}
