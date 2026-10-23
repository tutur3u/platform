import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { notifyDevboxRun } from '@tuturuuu/utils/devbox-control';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { assertDevboxRunnerAcceptsRun } from './runner-drain-guard';
import {
  createPrivateDevboxClient,
  type DevboxPrivateSchemaClient,
  type DevboxStorageErrorLike,
  DevboxStoreError,
  getDevboxStorageError,
} from './store-utils';

type PrivateQueryResult = Promise<{
  data: unknown[] | null;
  error: DevboxStorageErrorLike;
}>;
type PrivateOrderedQuery = {
  order: (
    column: string,
    options?: { ascending?: boolean }
  ) => PrivateOrderedQuery;
  limit: (count: number) => PrivateQueryResult;
  range: (from: number, to: number) => PrivateQueryResult;
};
type PrivateTableClient = {
  insert: (value: unknown) => Promise<{ error: DevboxStorageErrorLike }>;
  select: (columns?: string) => {
    eq: (
      column: string,
      value: string
    ) => {
      is: (column: string, value: null) => Pick<PrivateOrderedQuery, 'order'>;
    } & Pick<PrivateOrderedQuery, 'order'>;
  };
};

const DEVBOX_RUNNER_AUTHORIZED_STATUSES = new Set(['online', 'registered']);

export interface VerifiedDevboxRunner {
  heartbeatEnabled: boolean;
  id: string;
}

export interface CreateDevboxRunInput {
  actorId: string;
  command: string[];
  env?: Record<string, string>;
  envFiles?: string[];
  keep?: boolean;
  leaseId?: string;
  leaseMode?: 'auto' | 'existing';
  previewPorts?: number[];
  reuse?: boolean;
  runnerId?: string;
  timeoutSeconds?: number;
  workload?: 'run' | 'build' | 'serve' | 'tunnel' | 'maintenance' | 'judge';
}

export interface CreateDevboxLeaseInput {
  actorId: string;
  profile?: string;
  runnerId?: string;
  ttlSeconds?: number;
}

function getPrivateSchemaClient(client: unknown) {
  return client as DevboxPrivateSchemaClient;
}

function getPrivateSchemaClientFromAdmin(admin: TypedSupabaseClient) {
  return (
    admin as unknown as {
      schema: (schema: string) => DevboxPrivateSchemaClient;
    }
  ).schema('private');
}

function getPrivateTable(
  client: DevboxPrivateSchemaClient,
  table: string
): PrivateTableClient {
  return client.from(table) as PrivateTableClient;
}

type ScopedUpdateBuilder = {
  eq: (column: string, value: string) => ScopedUpdateBuilder;
  in: (column: string, values: string[]) => ScopedUpdateBuilder;
  select: (columns: string) => Promise<{
    data: unknown[] | null;
    error: DevboxStorageErrorLike;
  }>;
};

type OwnedRowSelectBuilder = {
  eq: (column: string, value: string) => OwnedRowSelectBuilder;
  limit: (count: number) => Promise<{
    data: unknown[] | null;
    error: DevboxStorageErrorLike;
  }>;
};

function getScopedUpdate(
  client: DevboxPrivateSchemaClient,
  table: string,
  value: Record<string, unknown>
) {
  return (
    client.from(table) as {
      update: (value: unknown) => ScopedUpdateBuilder;
    }
  ).update(value);
}

async function selectOwnedRow(
  client: DevboxPrivateSchemaClient,
  table: string,
  input: { actorId: string; columns: string; id: string }
) {
  const { data, error } = await (
    client.from(table) as {
      select: (columns: string) => OwnedRowSelectBuilder;
    }
  )
    .select(input.columns)
    .eq('id', input.id)
    .eq('actor_id', input.actorId)
    .limit(1);

  if (error) {
    throw getDevboxStorageError(error);
  }

  const row = data?.[0];
  return row && typeof row === 'object'
    ? (row as Record<string, unknown>)
    : null;
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

async function selectDevboxRunnerForToken(
  privateClient: DevboxPrivateSchemaClient,
  runnerId: string,
  includeHeartbeatEnabled = true
) {
  const result = await getPrivateTable(privateClient, 'devbox_runners')
    .select(
      includeHeartbeatEnabled
        ? 'id, actor_id, status, heartbeat_enabled'
        : 'id, actor_id, status'
    )
    .eq('id', runnerId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (
    result.error &&
    includeHeartbeatEnabled &&
    isMissingHeartbeatEnabledColumn(result.error)
  ) {
    return selectDevboxRunnerForToken(privateClient, runnerId, false);
  }

  return {
    data: result.data,
    error: result.error,
  };
}

export async function createDevboxRun(input: CreateDevboxRunInput) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const now = new Date().toISOString();
  const leaseId = input.leaseId ?? randomUUID();
  const runId = randomUUID();
  const leaseMode = input.leaseId ? 'existing' : (input.leaseMode ?? 'auto');

  await assertDevboxRunnerAcceptsRun(privateClient, {
    leaseId: input.leaseId,
    runnerId: input.runnerId,
    workload: input.workload,
  });

  if (leaseMode === 'auto') {
    const { error } = await getPrivateTable(
      privateClient,
      'devbox_leases'
    ).insert({
      actor_id: input.actorId,
      created_at: now,
      expires_at: input.keep
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      id: leaseId,
      keep: input.keep ?? false,
      runner_id: input.runnerId ?? null,
      status: 'active',
      updated_at: now,
    });

    if (error) {
      throw getDevboxStorageError(error);
    }
  }

  const runInsert = {
    actor_id: input.actorId,
    command: input.command,
    created_at: now,
    env: input.env ?? {},
    env_files: input.envFiles ?? [],
    id: runId,
    lease_id: leaseId,
    preview_ports: input.previewPorts ?? [],
    status: 'queued',
    timeout_seconds: input.timeoutSeconds ?? null,
    updated_at: now,
    workload: input.workload ?? 'run',
  };
  let { error } = await getPrivateTable(privateClient, 'devbox_runs').insert(
    runInsert
  );
  const storageMessage = error?.message?.toLowerCase() ?? '';
  if (
    (input.workload ?? 'run') === 'run' &&
    storageMessage.includes('workload') &&
    (storageMessage.includes('schema cache') ||
      storageMessage.includes('does not exist') ||
      storageMessage.includes('could not find'))
  ) {
    const { workload: _workload, ...legacyRunInsert } = runInsert;
    ({ error } = await getPrivateTable(privateClient, 'devbox_runs').insert(
      legacyRunInsert
    ));
  }

  if (error) {
    throw getDevboxStorageError(error);
  }

  await notifyDevboxRun(runId);

  return {
    lease: {
      id: leaseId,
      status: 'active',
    },
    run: {
      command: input.command,
      exitCode: null,
      id: runId,
      status: 'queued',
    },
  };
}

export async function createDevboxLease(input: CreateDevboxLeaseInput) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const now = new Date().toISOString();
  const leaseId = randomUUID();
  const { error } = await getPrivateTable(
    privateClient,
    'devbox_leases'
  ).insert({
    actor_id: input.actorId,
    created_at: now,
    expires_at: new Date(
      Date.now() + (input.ttlSeconds ?? 60 * 60) * 1000
    ).toISOString(),
    id: leaseId,
    keep: true,
    profile: input.profile ?? null,
    runner_id: input.runnerId ?? null,
    status: 'active',
    updated_at: now,
  });

  if (error) {
    throw getDevboxStorageError(error);
  }

  return {
    lease: {
      id: leaseId,
      status: 'active',
    },
  };
}

export async function releaseDevboxLease(input: {
  actorId: string;
  leaseId: string;
}) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const now = new Date().toISOString();
  const { data, error } = await getScopedUpdate(
    privateClient,
    'devbox_leases',
    {
      released_at: now,
      status: 'released',
      updated_at: now,
    }
  )
    .eq('id', input.leaseId)
    .eq('actor_id', input.actorId)
    .eq('status', 'active')
    .select('id');

  if (error) {
    throw getDevboxStorageError(error);
  }

  if (!data?.length) {
    // Repeated releases stay idempotent for the owner without rewriting
    // released_at; leases owned by another actor are indistinguishable from
    // unknown ids.
    const existing = await selectOwnedRow(privateClient, 'devbox_leases', {
      actorId: input.actorId,
      columns: 'id,status',
      id: input.leaseId,
    });
    if (existing?.status !== 'released') {
      throw new DevboxStoreError('Devbox lease not found.', 404);
    }
  }

  return { message: `Devbox lease ${input.leaseId} released.` };
}

export async function stopDevboxRun(input: { actorId: string; runId: string }) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const now = new Date().toISOString();

  // Queued runs have no process to signal, so they finish immediately.
  const queued = await getScopedUpdate(privateClient, 'devbox_runs', {
    completed_at: now,
    status: 'cancelled',
    updated_at: now,
  })
    .eq('id', input.runId)
    .eq('actor_id', input.actorId)
    .eq('status', 'queued')
    .select('id');

  if (queued.error) {
    throw getDevboxStorageError(queued.error);
  }

  if (queued.data?.length) {
    return {
      message: `Devbox run ${input.runId} cancelled.`,
      status: 'cancelled' as const,
    };
  }

  // Running runs are signalled through the agent; terminal runs never change.
  const running = await getScopedUpdate(privateClient, 'devbox_runs', {
    status: 'cancel_requested',
    updated_at: now,
  })
    .eq('id', input.runId)
    .eq('actor_id', input.actorId)
    .eq('status', 'running')
    .select('id');

  if (running.error) {
    throw getDevboxStorageError(running.error);
  }

  if (!running.data?.length) {
    const existing = await selectOwnedRow(privateClient, 'devbox_runs', {
      actorId: input.actorId,
      columns: 'id,status',
      id: input.runId,
    });
    if (existing?.status === 'cancelled') {
      return {
        message: `Devbox run ${input.runId} cancelled.`,
        status: 'cancelled' as const,
      };
    }
    if (existing?.status === 'succeeded' || existing?.status === 'failed') {
      return {
        message: `Devbox run ${input.runId} ${existing.status}.`,
        status: existing.status,
      };
    }
    if (existing?.status !== 'cancel_requested') {
      throw new DevboxStoreError('Active devbox run not found.', 404);
    }
  }

  return {
    message: `Devbox run ${input.runId} cancellation requested.`,
    status: 'cancel_requested' as const,
  };
}

export const DEVBOX_RUN_LOG_PAGE_SIZE = 1000;

// Pages run events in a stable order. `next` is the raw-row offset to request
// next, so clients stream long runs incrementally instead of refetching (and
// truncating at) the first page.
export async function listDevboxRunLogs(input: {
  actorId: string;
  offset?: number;
  runId: string;
}) {
  const offset = input.offset ?? 0;
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const run = await selectOwnedRow(privateClient, 'devbox_runs', {
    actorId: input.actorId,
    columns: 'id',
    id: input.runId,
  });

  if (!run) {
    throw new DevboxStoreError('Devbox run not found.', 404);
  }

  const { data, error } = await getPrivateTable(
    privateClient,
    'devbox_run_events'
  )
    .select('message')
    .eq('run_id', input.runId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + DEVBOX_RUN_LOG_PAGE_SIZE - 1);

  if (error) {
    throw getDevboxStorageError(error);
  }

  const rows = data ?? [];
  return {
    logs: rows
      .map((row) =>
        row && typeof row === 'object' && 'message' in row
          ? String(row.message ?? '')
          : ''
      )
      .filter(Boolean),
    next: offset + rows.length,
  };
}

export async function createDevboxPreview(input: {
  leaseId: string;
  port: number;
}) {
  return {
    url: `/api/v1/devboxes/previews/${encodeURIComponent(input.leaseId)}/${input.port}`,
  };
}

export async function registerDevboxAgent(input: {
  actorId: string;
  name: string;
}) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const now = new Date().toISOString();
  const runnerId = randomUUID();
  const token = `tdbx_${randomBytes(32).toString('hex')}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const runnerResult = await getPrivateTable(
    privateClient,
    'devbox_runners'
  ).insert({
    actor_id: input.actorId,
    created_at: now,
    id: runnerId,
    name: input.name,
    status: 'registered',
    updated_at: now,
  });

  if (runnerResult.error) {
    throw getDevboxStorageError(runnerResult.error);
  }

  const tokenResult = await getPrivateTable(
    privateClient,
    'devbox_runner_tokens'
  ).insert({
    created_at: now,
    id: randomUUID(),
    runner_id: runnerId,
    token_hash: tokenHash,
  });

  if (tokenResult.error) {
    throw getDevboxStorageError(tokenResult.error);
  }

  return {
    runner: {
      id: runnerId,
      name: input.name,
    },
    token,
  };
}

export async function updateDevboxEnv(input: {
  actorId: string;
  leaseId: string;
  removals?: string[];
  updates?: Record<string, string>;
}) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const { error } = await getPrivateTable(
    privateClient,
    'devbox_env_revisions'
  ).insert({
    actor_id: input.actorId,
    created_at: new Date().toISOString(),
    id: randomUUID(),
    lease_id: input.leaseId,
    removals: input.removals ?? [],
    updates: input.updates ?? {},
  });

  if (error) {
    throw getDevboxStorageError(error);
  }

  return { revision: Date.now() };
}

export async function verifyDevboxRunnerToken(
  token: string,
  options: { requireOnline?: boolean } = {}
): Promise<VerifiedDevboxRunner | null> {
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const privateClient = getPrivateSchemaClientFromAdmin(admin);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await getPrivateTable(
    privateClient,
    'devbox_runner_tokens'
  )
    .select('runner_id')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw getDevboxStorageError(error);
  }

  const first = data?.[0];
  const runnerId =
    first && typeof first === 'object' && 'runner_id' in first
      ? String(first.runner_id ?? '')
      : '';

  if (!runnerId) {
    return null;
  }

  const { data: runnerData, error: runnerError } =
    await selectDevboxRunnerForToken(privateClient, runnerId);

  if (runnerError) {
    throw getDevboxStorageError(runnerError);
  }

  const runner = runnerData?.[0];
  const actorId =
    runner && typeof runner === 'object' && 'actor_id' in runner
      ? String(runner.actor_id ?? '')
      : '';
  const status =
    runner && typeof runner === 'object' && 'status' in runner
      ? String(runner.status ?? '')
      : '';
  const heartbeatEnabled =
    runner && typeof runner === 'object' && 'heartbeat_enabled' in runner
      ? runner.heartbeat_enabled === true
      : false;

  if (
    !actorId ||
    (options.requireOnline
      ? status !== 'online'
      : !DEVBOX_RUNNER_AUTHORIZED_STATUSES.has(status))
  ) {
    return null;
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: admin,
    userId: actorId,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!membership.ok && membership.error === 'membership_lookup_failed') {
    throw new DevboxStoreError('Devbox runner membership lookup failed.', 503);
  }

  return membership.ok ? { heartbeatEnabled, id: runnerId } : null;
}

export async function listDevboxRuns(actorId: string) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const { data, error } = await getPrivateTable(privateClient, 'devbox_runs')
    .select('id,status,command,exit_code,created_at,lease_id,runner_id')
    .eq('actor_id', actorId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw getDevboxStorageError(error);
  }

  return {
    runs: data ?? [],
  };
}
