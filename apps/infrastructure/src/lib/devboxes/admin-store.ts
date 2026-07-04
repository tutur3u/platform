import {
  createPrivateDevboxClient,
  type DevboxPrivateSchemaClient,
  type DevboxStorageErrorLike,
  getDevboxStorageError,
} from './store-utils';

type QueryResult<T = unknown> = {
  data: T[] | null;
  error: DevboxStorageErrorLike;
};

type SelectQuery<T = unknown> = {
  eq: (column: string, value: string) => SelectQuery<T>;
  limit: (count: number) => Promise<QueryResult<T>>;
  order: (
    column: string,
    options?: { ascending?: boolean }
  ) => {
    limit: (count: number) => Promise<QueryResult<T>>;
  };
};

type UpdateQuery = {
  eq: (
    column: string,
    value: string
  ) => Promise<{ error: DevboxStorageErrorLike }>;
};

type PrivateAdminTable<T = unknown> = {
  delete: () => UpdateQuery;
  select: (columns: string) => SelectQuery<T>;
  update: (value: unknown) => UpdateQuery;
};

export interface DevboxAdminRunner {
  actor_id: string;
  capabilities: unknown;
  created_at: string;
  heartbeat_enabled: boolean;
  id: string;
  last_heartbeat_at: string | null;
  name: string;
  status: string;
  updated_at: string;
}

export interface DevboxAdminLease {
  actor_id: string;
  cleanup_status: string;
  created_at: string;
  expires_at: string;
  id: string;
  keep: boolean;
  profile: string | null;
  released_at: string | null;
  runner_id: string | null;
  status: string;
  updated_at: string;
}

export interface DevboxAdminRun {
  actor_id: string;
  command: string[];
  completed_at: string | null;
  created_at: string;
  exit_code: number | null;
  id: string;
  lease_id: string;
  preview_ports: number[];
  runner_id: string | null;
  started_at: string | null;
  status: string;
  timeout_seconds: number | null;
  updated_at: string;
}

export interface DevboxAdminEvent {
  created_at: string;
  event_type: string;
  id: string;
  message: string | null;
  run_id: string;
}

export interface DevboxAdminCacheRecord {
  cache_key: string;
  cache_type: string;
  created_at: string;
  id: string;
  last_used_at: string;
  runner_id: string | null;
  size_bytes: number;
}

export interface DevboxAdminRunnerToken {
  created_at: string;
  id: string;
  revoked_at: string | null;
  runner_id: string;
}

export interface DevboxControlSnapshot {
  caches: DevboxAdminCacheRecord[];
  events: DevboxAdminEvent[];
  leases: DevboxAdminLease[];
  metrics: {
    activeLeases: number;
    activeRunnerTokens: number;
    activeRunners: number;
    failedRuns: number;
    queuedRuns: number;
    runningRuns: number;
    totalRuns: number;
  };
  runnerTokens: DevboxAdminRunnerToken[];
  runners: DevboxAdminRunner[];
  runs: DevboxAdminRun[];
}

function getPrivateAdminTable<T>(
  client: DevboxPrivateSchemaClient,
  table: string
) {
  return client.from(table) as PrivateAdminTable<T>;
}

function assertQueryResult<T>(result: QueryResult<T>) {
  if (result.error) {
    throw getDevboxStorageError(result.error);
  }

  return result.data ?? [];
}

function countByStatus(rows: { status: string }[], status: string) {
  return rows.filter((row) => row.status === status).length;
}

function isMissingHeartbeatEnabledColumn(error: DevboxStorageErrorLike) {
  const normalized = error?.message?.toLowerCase() ?? '';
  return (
    normalized.includes('heartbeat_enabled') &&
    (normalized.includes('schema cache') ||
      normalized.includes('does not exist') ||
      normalized.includes('could not find'))
  );
}

async function listDevboxAdminRunners(client: DevboxPrivateSchemaClient) {
  const runnersResult = await getPrivateAdminTable<DevboxAdminRunner>(
    client,
    'devbox_runners'
  )
    .select(
      'id,actor_id,name,status,capabilities,heartbeat_enabled,last_heartbeat_at,created_at,updated_at'
    )
    .order('updated_at', { ascending: false })
    .limit(50);

  if (
    !runnersResult.error ||
    !isMissingHeartbeatEnabledColumn(runnersResult.error)
  ) {
    return runnersResult;
  }

  const fallbackResult = await getPrivateAdminTable<
    Omit<DevboxAdminRunner, 'heartbeat_enabled'>
  >(client, 'devbox_runners')
    .select(
      'id,actor_id,name,status,capabilities,last_heartbeat_at,created_at,updated_at'
    )
    .order('updated_at', { ascending: false })
    .limit(50);

  return {
    data:
      fallbackResult.data?.map((runner) => ({
        ...runner,
        heartbeat_enabled: false,
      })) ?? null,
    error: fallbackResult.error,
  };
}

export async function listDevboxControlSnapshot(): Promise<DevboxControlSnapshot> {
  const privateClient = await createPrivateDevboxClient();
  const client = privateClient as DevboxPrivateSchemaClient;

  const [runnersResult, leasesResult, runsResult, eventsResult, cachesResult] =
    await Promise.all([
      listDevboxAdminRunners(client),
      getPrivateAdminTable<DevboxAdminLease>(client, 'devbox_leases')
        .select(
          'id,actor_id,runner_id,status,profile,keep,expires_at,released_at,cleanup_status,created_at,updated_at'
        )
        .order('created_at', { ascending: false })
        .limit(50),
      getPrivateAdminTable<DevboxAdminRun>(client, 'devbox_runs')
        .select(
          'id,actor_id,lease_id,runner_id,status,command,preview_ports,timeout_seconds,exit_code,started_at,completed_at,created_at,updated_at'
        )
        .order('created_at', { ascending: false })
        .limit(50),
      getPrivateAdminTable<DevboxAdminEvent>(client, 'devbox_run_events')
        .select('id,run_id,event_type,message,created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      getPrivateAdminTable<DevboxAdminCacheRecord>(
        client,
        'devbox_cache_records'
      )
        .select(
          'id,runner_id,cache_key,cache_type,size_bytes,last_used_at,created_at'
        )
        .order('last_used_at', { ascending: false })
        .limit(50),
    ]);

  const runnerTokensResult = await getPrivateAdminTable<DevboxAdminRunnerToken>(
    client,
    'devbox_runner_tokens'
  )
    .select('id,runner_id,revoked_at,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const runners = assertQueryResult(runnersResult);
  const leases = assertQueryResult(leasesResult);
  const runs = assertQueryResult(runsResult);
  const events = assertQueryResult(eventsResult);
  const caches = assertQueryResult(cachesResult);
  const runnerTokens = assertQueryResult(runnerTokensResult);

  return {
    caches,
    events,
    leases,
    metrics: {
      activeLeases: countByStatus(leases, 'active'),
      activeRunnerTokens: runnerTokens.filter((token) => !token.revoked_at)
        .length,
      activeRunners: runners.filter((runner) => runner.status !== 'revoked')
        .length,
      failedRuns: countByStatus(runs, 'failed'),
      queuedRuns: countByStatus(runs, 'queued'),
      runningRuns: countByStatus(runs, 'running'),
      totalRuns: runs.length,
    },
    runnerTokens,
    runners,
    runs,
  };
}

export async function revokeDevboxRunner(runnerId: string) {
  const privateClient =
    (await createPrivateDevboxClient()) as DevboxPrivateSchemaClient;
  const now = new Date().toISOString();

  const tokenResult = await getPrivateAdminTable(
    privateClient,
    'devbox_runner_tokens'
  )
    .delete()
    .eq('runner_id', runnerId);

  if (tokenResult.error) {
    throw getDevboxStorageError(tokenResult.error);
  }

  const runnerResult = await getPrivateAdminTable(
    privateClient,
    'devbox_runners'
  )
    .update({ status: 'revoked', updated_at: now })
    .eq('id', runnerId);

  if (runnerResult.error) {
    throw getDevboxStorageError(runnerResult.error);
  }

  return { message: `Devbox runner ${runnerId} revoked.` };
}

export async function setDevboxRunnerHeartbeatEnabled(
  runnerId: string,
  enabled: boolean
) {
  const privateClient =
    (await createPrivateDevboxClient()) as DevboxPrivateSchemaClient;
  const now = new Date().toISOString();

  const runnerResult = await getPrivateAdminTable<{ status: string }>(
    privateClient,
    'devbox_runners'
  )
    .select('status')
    .eq('id', runnerId)
    .limit(1);

  if (runnerResult.error) {
    throw getDevboxStorageError(runnerResult.error);
  }

  const status = runnerResult.data?.[0]?.status;
  const update = {
    heartbeat_enabled: enabled,
    ...(!enabled && status !== 'revoked' ? { status: 'registered' } : {}),
    updated_at: now,
  };

  const updateResult = await getPrivateAdminTable(
    privateClient,
    'devbox_runners'
  )
    .update(update)
    .eq('id', runnerId);

  if (updateResult.error) {
    throw getDevboxStorageError(updateResult.error);
  }

  return {
    message: `Devbox runner ${runnerId} heartbeat ${
      enabled ? 'enabled' : 'disabled'
    }.`,
  };
}
