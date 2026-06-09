import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  createPrivateDevboxClient,
  type DevboxPrivateSchemaClient,
  type DevboxStorageErrorLike,
  getDevboxStorageError,
} from './store-utils';

type PrivateTableClient = {
  insert: (value: unknown) => Promise<{ error: DevboxStorageErrorLike }>;
  select: (columns?: string) => {
    eq: (
      column: string,
      value: string
    ) => {
      is: (
        column: string,
        value: null
      ) => {
        order: (
          column: string,
          options?: { ascending?: boolean }
        ) => {
          limit: (count: number) => Promise<{
            data: unknown[] | null;
            error: DevboxStorageErrorLike;
          }>;
        };
      };
      order: (
        column: string,
        options?: { ascending?: boolean }
      ) => {
        limit: (count: number) => Promise<{
          data: unknown[] | null;
          error: DevboxStorageErrorLike;
        }>;
      };
    };
  };
  update: (value: unknown) => {
    eq: (
      column: string,
      value: string
    ) => Promise<{ error: DevboxStorageErrorLike }>;
  };
};

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

function getPrivateTable(
  client: DevboxPrivateSchemaClient,
  table: string
): PrivateTableClient {
  return client.from(table) as PrivateTableClient;
}

export async function createDevboxRun(input: CreateDevboxRunInput) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const now = new Date().toISOString();
  const leaseId = input.leaseId ?? randomUUID();
  const runId = randomUUID();
  const leaseMode = input.leaseId ? 'existing' : (input.leaseMode ?? 'auto');

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

  const { error } = await getPrivateTable(privateClient, 'devbox_runs').insert({
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
  });

  if (error) {
    throw getDevboxStorageError(error);
  }

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

export async function releaseDevboxLease(leaseId: string) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const { error } = await getPrivateTable(privateClient, 'devbox_leases')
    .update({
      released_at: new Date().toISOString(),
      status: 'released',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leaseId);

  if (error) {
    throw getDevboxStorageError(error);
  }

  return { message: `Devbox lease ${leaseId} released.` };
}

export async function stopDevboxRun(runId: string) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const { error } = await getPrivateTable(privateClient, 'devbox_runs')
    .update({
      status: 'cancel_requested',
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) {
    throw getDevboxStorageError(error);
  }

  return { message: `Devbox run ${runId} cancellation requested.` };
}

export async function listDevboxRunLogs(runId: string) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
  const { data, error } = await getPrivateTable(
    privateClient,
    'devbox_run_events'
  )
    .select('message')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
    .limit(1000);

  if (error) {
    throw getDevboxStorageError(error);
  }

  return {
    logs: (data ?? [])
      .map((row) =>
        row && typeof row === 'object' && 'message' in row
          ? String(row.message ?? '')
          : ''
      )
      .filter(Boolean),
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

export async function verifyDevboxRunnerToken(token: string) {
  const privateClient = getPrivateSchemaClient(
    await createPrivateDevboxClient()
  );
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

  return runnerId ? { id: runnerId } : null;
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
