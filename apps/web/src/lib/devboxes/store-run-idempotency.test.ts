import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock, notifyDevboxRunMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  notifyDevboxRunMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock('@tuturuuu/utils/devbox-control', () => ({
  notifyDevboxRun: notifyDevboxRunMock,
}));
vi.mock('./runner-drain-guard', () => ({
  assertDevboxRunnerAcceptsRun: vi.fn(),
}));

import { createDevboxRun, stopDevboxRunByKey } from './store';
import { resetDevboxIdempotencyReadinessForTests } from './store-run-idempotency';
import { DevboxStoreError } from './store-utils';

type Row = Record<string, unknown>;
type SchemaOptions = {
  // devbox_run_idempotency_ready(): true, false, or missing (pre-migration).
  ready?: boolean | 'missing';
  // Key column missing from the schema cache at lookup or at insert.
  keyColumn?: 'present' | 'missing-lookup' | 'missing-insert';
  raceWinner?: Row;
};

const trustedRunner = {
  capabilities: { executionMode: 'trusted', protocols: { commitRun: [1] } },
  enabled_features: { run: true },
  id: 'trusted-1',
};

// In-memory private schema with the migration's unique (actor, key) index.
// `raceWinner` simulates a concurrent create with the same key committing
// between this request's lookup and its insert.
function createSchema(options: SchemaOptions = {}) {
  const tables: Record<
    'devbox_leases' | 'devbox_runners' | 'devbox_runs',
    Row[]
  > = {
    devbox_leases: [],
    devbox_runners: [{ ...trustedRunner }],
    devbox_runs: [],
  };
  const missingColumn = {
    message:
      "Could not find the 'idempotency_key' column of 'devbox_runs' in the schema cache",
  };
  let raced = false;
  const from = (table: string) => {
    const rows = tables[table as keyof typeof tables];
    const filters: ((row: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let columns = '';
    const matched = () => rows.filter((row) => filters.every((f) => f(row)));
    const builder = {
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      insert(value: Row) {
        if (table === 'devbox_runs' && 'idempotency_key' in value) {
          if (options.keyColumn === 'missing-insert')
            return Promise.resolve({ error: missingColumn });
          if (options.raceWinner && !raced) {
            raced = true;
            rows.push(options.raceWinner);
          }
          if (
            rows.some(
              (row) =>
                row.actor_id === value.actor_id &&
                row.idempotency_key === value.idempotency_key
            )
          )
            return Promise.resolve({
              error: { code: '23505', message: 'duplicate key value' },
            });
        }
        rows.push({ ...value });
        return Promise.resolve({ error: null });
      },
      limit(count: number) {
        if (
          options.keyColumn === 'missing-lookup' &&
          table === 'devbox_runs' &&
          columns.includes('lease_id')
        )
          return Promise.resolve({ data: null, error: missingColumn });
        return Promise.resolve({
          data: matched().slice(0, count),
          error: null,
        });
      },
      select(selected = '') {
        columns = selected;
        if (!patch) return builder;
        const changed = matched();
        for (const row of changed) Object.assign(row, patch);
        return Promise.resolve({
          data: changed.map((row) => ({ id: row.id })),
          error: null,
        });
      },
      update(value: Row) {
        patch = value;
        return builder;
      },
    };
    return builder;
  };
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'check_devbox_write_ownership')
      return { data: null, error: null };
    if (fn !== 'devbox_run_idempotency_ready')
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    const ready = options.ready ?? true;
    return ready === 'missing'
      ? {
          data: null,
          error: {
            message:
              'Could not find the function private.devbox_run_idempotency_ready without parameters in the schema cache',
          },
        }
      : { data: ready, error: null };
  });
  createAdminClientMock.mockResolvedValue({
    schema: vi.fn().mockReturnValue({ from, rpc }),
  });
  return { rpc, tables };
}

const key = '7d0c3a9e-1f3b-4c55-9f1e-2a3b4c5d6e7f';
const create = (
  overrides: Partial<Parameters<typeof createDevboxRun>[0]> = {}
) =>
  createDevboxRun({
    actorId: 'owner',
    command: ['__ttr_commit_run_v1__', 'payload'],
    idempotencyKey: key,
    leaseMode: 'auto',
    runnerId: 'trusted-1',
    workload: 'run',
    ...overrides,
  });

describe('devbox run creation idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDevboxIdempotencyReadinessForTests();
  });

  it('returns the original run when a create is retried with the same key', async () => {
    const { tables } = createSchema();
    const first = await create();
    const retry = await create();
    expect(retry.run.id).toBe(first.run.id);
    expect(retry).toMatchObject({ replayed: true });
    expect(tables.devbox_runs).toHaveLength(1);
    expect(tables.devbox_runs[0]).toMatchObject({ idempotency_key: key });
    // The retry never made a second lease or a second runner notification.
    expect(tables.devbox_leases).toHaveLength(1);
    expect(notifyDevboxRunMock).toHaveBeenCalledTimes(1);
  });

  it('scopes keys per actor and refuses reuse for a different command', async () => {
    const { tables } = createSchema();
    await create();
    await create({ actorId: 'other' });
    expect(tables.devbox_runs).toHaveLength(2);
    await expect(create({ command: ['other'] })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('returns the concurrent winner and retires its own lease on a key race', async () => {
    const winner = {
      actor_id: 'owner',
      command: ['__ttr_commit_run_v1__', 'payload'],
      exit_code: null,
      id: 'run-winner',
      idempotency_key: key,
      lease_id: 'lease-winner',
      status: 'queued',
    };
    const { tables } = createSchema({ raceWinner: winner });
    await expect(create()).resolves.toMatchObject({
      replayed: true,
      run: { id: 'run-winner' },
    });
    expect(tables.devbox_runs).toEqual([winner]);
    expect(tables.devbox_leases[0]).toMatchObject({ status: 'released' });
    expect(notifyDevboxRunMock).not.toHaveBeenCalled();
  });

  it.each([
    ['readiness function missing', { ready: 'missing' }],
    ['unique index not yet valid', { ready: false }],
    [
      'key column missing from the schema cache',
      { keyColumn: 'missing-lookup' },
    ],
  ] as const)(
    'refuses a keyed create with a coded 503 before any write: %s',
    async (_case, options) => {
      const { tables } = createSchema(options);
      await expect(create()).rejects.toMatchObject({
        code: 'DEVBOX_IDEMPOTENCY_UNAVAILABLE',
        status: 503,
      });
      expect(tables.devbox_leases).toEqual([]);
      expect(tables.devbox_runs).toEqual([]);
      expect(notifyDevboxRunMock).not.toHaveBeenCalled();
    }
  );

  it('releases its lease and refuses when the key column vanishes at insert', async () => {
    const { tables } = createSchema({ keyColumn: 'missing-insert' });
    await expect(create()).rejects.toMatchObject({ status: 503 });
    expect(tables.devbox_runs).toEqual([]);
    expect(tables.devbox_leases[0]).toMatchObject({ status: 'released' });
  });

  it('keeps unkeyed creates compatible without consulting key storage', async () => {
    const { rpc, tables } = createSchema({ ready: 'missing' });
    await expect(
      create({ command: ['echo', 'hi'], idempotencyKey: undefined })
    ).resolves.toMatchObject({ run: { status: 'queued' } });
    expect(
      rpc.mock.calls.filter(([fn]) => fn === 'devbox_run_idempotency_ready')
    ).toHaveLength(0);
    expect(tables.devbox_runs).toHaveLength(1);
  });

  it('caches confirmed key storage', async () => {
    const { rpc } = createSchema();
    await create();
    await create({ idempotencyKey: `${key}-2` });
    expect(
      rpc.mock.calls.filter(([fn]) => fn === 'devbox_run_idempotency_ready')
    ).toHaveLength(1);
  });

  it('stops only the caller run created with the key', async () => {
    const { tables } = createSchema();
    const { run } = await create();
    await expect(
      stopDevboxRunByKey({ actorId: 'other', idempotencyKey: key })
    ).rejects.toBeInstanceOf(DevboxStoreError);
    await expect(
      stopDevboxRunByKey({ actorId: 'owner', idempotencyKey: key })
    ).resolves.toMatchObject({ runId: run.id, status: 'cancelled' });
    expect(tables.devbox_runs[0]).toMatchObject({ status: 'cancelled' });
  });
});
