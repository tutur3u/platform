import { randomUUID } from 'node:crypto';
import {
  createPrivateDevboxClient,
  type DevboxPrivateSchemaClient,
  type DevboxStorageErrorLike,
  DevboxStoreError,
  getDevboxStorageError,
} from './store-utils';

type QueryResult<T> = Promise<{
  data: T | null;
  error: DevboxStorageErrorLike;
}>;

type SelectFilter = {
  eq: (column: string, value: string) => SelectFilter;
  order: (
    column: string,
    options?: { ascending?: boolean }
  ) => {
    limit: (count: number) => QueryResult<unknown[]>;
  };
  limit: (count: number) => QueryResult<unknown[]>;
};

type UpdateFilter = {
  eq: (column: string, value: string) => UpdateFilter;
  select: (columns: string) => QueryResult<unknown[]>;
};

type PrivateTableClient = {
  insert: (value: unknown) => Promise<{ error: DevboxStorageErrorLike }>;
  select: (columns?: string) => SelectFilter;
  update: (value: unknown) => {
    eq: (
      column: string,
      value: string
    ) => UpdateFilter & Promise<{ error: DevboxStorageErrorLike }>;
  };
};

type DevboxClaimedRunRow = {
  command?: unknown;
  created_at?: unknown;
  env?: unknown;
  env_files?: unknown;
  id?: unknown;
  lease_id?: unknown;
  preview_ports?: unknown;
  timeout_seconds?: unknown;
  updated_at?: unknown;
};

type DevboxCompletedRunRow = {
  exit_code?: unknown;
  id?: unknown;
  lease_id?: unknown;
  status?: unknown;
};

export type DevboxRunTerminalStatus = 'cancelled' | 'failed' | 'succeeded';

export interface DevboxAgentEventInput {
  eventType?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface CompleteDevboxRunInput {
  exitCode: number;
  runId: string;
  status: DevboxRunTerminalStatus;
}

function getPrivateTable(
  client: DevboxPrivateSchemaClient,
  table: string
): PrivateTableClient {
  return client.from(table) as PrivateTableClient;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function asNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is number =>
          typeof entry === 'number' && Number.isFinite(entry)
      )
    : [];
}

function asStringRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
      .map(([key, entryValue]) => [key, entryValue])
  );
}

function asOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toClaimedJob(row: DevboxClaimedRunRow) {
  const runId = asString(row.id);
  const leaseId = asString(row.lease_id);
  const command = asStringArray(row.command);

  if (!runId || !leaseId || command.length === 0) {
    throw new DevboxStoreError('Invalid claimed devbox run payload.');
  }

  return {
    command,
    createdAt: asString(row.created_at),
    env: asStringRecord(row.env),
    envFiles: asStringArray(row.env_files),
    leaseId,
    previewPorts: asNumberArray(row.preview_ports),
    runId,
    timeoutSeconds: asOptionalNumber(row.timeout_seconds),
    updatedAt: asString(row.updated_at),
  };
}

export async function heartbeatDevboxRunner(
  runnerId: string,
  capabilities?: unknown
) {
  const privateClient = await createPrivateDevboxClient();
  const update = {
    ...(capabilities ? { capabilities } : {}),
    last_heartbeat_at: new Date().toISOString(),
    status: 'online',
    updated_at: new Date().toISOString(),
  };
  const { error } = await getPrivateTable(privateClient, 'devbox_runners')
    .update(update)
    .eq('id', runnerId);

  if (error) {
    throw getDevboxStorageError(error);
  }

  return { message: 'heartbeat accepted' };
}

export async function claimNextDevboxRun(runnerId: string) {
  const privateClient = await createPrivateDevboxClient();
  const { data, error } = await privateClient.rpc<DevboxClaimedRunRow[]>(
    'claim_next_devbox_run',
    { p_runner_id: runnerId }
  );

  if (error) {
    throw getDevboxStorageError(error);
  }

  const first = data?.[0];
  return first ? toClaimedJob(first) : null;
}

async function assertRunnerOwnsRun(
  privateClient: DevboxPrivateSchemaClient,
  runnerId: string,
  runId: string
) {
  const { data, error } = await getPrivateTable(privateClient, 'devbox_runs')
    .select('id')
    .eq('id', runId)
    .eq('runner_id', runnerId)
    .limit(1);

  if (error) {
    throw getDevboxStorageError(error);
  }

  if (!data?.length) {
    throw new DevboxStoreError('Devbox run not found for runner.', 404);
  }
}

export async function recordDevboxRunEvents(input: {
  events: DevboxAgentEventInput[];
  runId: string;
  runnerId: string;
}) {
  const events = input.events.filter(
    (event) => event.message || event.eventType || event.metadata
  );
  if (events.length === 0) {
    return { events: 0 };
  }

  const privateClient = await createPrivateDevboxClient();
  await assertRunnerOwnsRun(privateClient, input.runnerId, input.runId);

  const { error } = await getPrivateTable(
    privateClient,
    'devbox_run_events'
  ).insert(
    events.map((event) => ({
      created_at: new Date().toISOString(),
      event_type: event.eventType ?? 'log',
      id: randomUUID(),
      message: event.message ?? null,
      metadata: event.metadata ?? {},
      run_id: input.runId,
    }))
  );

  if (error) {
    throw getDevboxStorageError(error);
  }

  return { events: events.length };
}

export async function completeDevboxRun(
  input: CompleteDevboxRunInput & {
    runnerId: string;
  }
) {
  const privateClient = await createPrivateDevboxClient();
  const { data, error } = await privateClient.rpc<DevboxCompletedRunRow[]>(
    'complete_devbox_run',
    {
      p_exit_code: input.exitCode,
      p_run_id: input.runId,
      p_runner_id: input.runnerId,
      p_status: input.status,
    }
  );

  if (error) {
    throw getDevboxStorageError(error);
  }

  const first = data?.[0];
  if (!first) {
    throw new DevboxStoreError('Devbox run not found for runner.', 404);
  }

  return {
    run: {
      exitCode: asOptionalNumber(first.exit_code),
      id: asString(first.id),
      leaseId: asString(first.lease_id),
      status: asString(first.status),
    },
  };
}

export async function getDevboxRun(input: { actorId: string; runId: string }) {
  const privateClient = await createPrivateDevboxClient();
  const { data: runRows, error: runError } = await getPrivateTable(
    privateClient,
    'devbox_runs'
  )
    .select('id,status,command,exit_code,created_at,lease_id,runner_id')
    .eq('id', input.runId)
    .eq('actor_id', input.actorId)
    .limit(1);

  if (runError) {
    throw getDevboxStorageError(runError);
  }

  const run = runRows?.[0];
  if (!run || typeof run !== 'object') {
    throw new DevboxStoreError('Devbox run not found.', 404);
  }

  const { data: eventRows, error: eventsError } = await getPrivateTable(
    privateClient,
    'devbox_run_events'
  )
    .select('message')
    .eq('run_id', input.runId)
    .order('created_at', { ascending: true })
    .limit(1000);

  if (eventsError) {
    throw getDevboxStorageError(eventsError);
  }

  const record = run as Record<string, unknown>;
  return {
    logs: (eventRows ?? [])
      .map((row) =>
        row && typeof row === 'object' && 'message' in row
          ? String(row.message ?? '')
          : ''
      )
      .filter(Boolean),
    run: {
      command: asStringArray(record.command),
      exitCode: asOptionalNumber(record.exit_code),
      id: asString(record.id),
      leaseId: asString(record.lease_id),
      status: asString(record.status),
    },
  };
}
