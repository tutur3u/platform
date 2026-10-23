import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { listDevboxRunLogs, releaseDevboxLease, stopDevboxRun } from './store';
import { DevboxStoreError } from './store-utils';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

// Minimal in-memory PostgREST builder: filters apply to update and select so
// the tests exercise the actual scoping instead of asserting call shapes.
function createPrivateSchema(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const filters: Filter[] = [];
    let patch: Row | null = null;

    const matched = () => rows.filter((row) => filters.every((f) => f(row)));
    const builder = {
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      limit(count: number) {
        return Promise.resolve({
          data: matched().slice(0, count),
          error: null,
        });
      },
      order() {
        return builder;
      },
      select() {
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

  return { from };
}

describe('devbox store actor scoping', () => {
  let tables: Record<string, Row[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T00:00:00Z'));
    tables = {
      devbox_leases: [
        { actor_id: 'owner', id: 'lease-active', status: 'active' },
        { actor_id: 'owner', id: 'lease-released', status: 'released' },
      ],
      devbox_run_events: [
        { message: 'hello', run_id: 'run-running' },
        { message: 'secret', run_id: 'run-other' },
      ],
      devbox_runs: [
        { actor_id: 'owner', id: 'run-queued', status: 'queued' },
        { actor_id: 'owner', id: 'run-running', status: 'running' },
        { actor_id: 'owner', id: 'run-succeeded', status: 'succeeded' },
        { actor_id: 'owner', id: 'run-failed', status: 'failed' },
        { actor_id: 'other', id: 'run-other', status: 'running' },
      ],
    };
    createAdminClientMock.mockResolvedValue({
      schema: () => createPrivateSchema(tables),
    });
  });

  afterEach(() => vi.useRealTimers());

  const runStatus = (id: string) =>
    tables.devbox_runs?.find((row) => row.id === id)?.status;

  async function expectNotFound(promise: Promise<unknown>) {
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DevboxStoreError);
    expect((error as DevboxStoreError).status).toBe(404);
  }

  it('cancels queued runs immediately', async () => {
    await expect(
      stopDevboxRun({ actorId: 'owner', runId: 'run-queued' })
    ).resolves.toMatchObject({ status: 'cancelled' });

    expect(runStatus('run-queued')).toBe('cancelled');
    expect(
      tables.devbox_runs?.find((row) => row.id === 'run-queued')?.completed_at
    ).toEqual(expect.any(String));
  });

  it('requests cancellation for running runs and stays idempotent', async () => {
    const input = { actorId: 'owner', runId: 'run-running' };
    await expect(stopDevboxRun(input)).resolves.toMatchObject({
      status: 'cancel_requested',
    });
    const requested = structuredClone(tables.devbox_runs);
    vi.advanceTimersByTime(60_000);
    await expect(stopDevboxRun(input)).resolves.toMatchObject({
      status: 'cancel_requested',
    });

    expect(runStatus('run-running')).toBe('cancel_requested');
    expect(tables.devbox_runs).toEqual(requested);
  });

  it('returns an unchanged cancellation when a queued stop is retried', async () => {
    const input = { actorId: 'owner', runId: 'run-queued' };
    await expect(stopDevboxRun(input)).resolves.toMatchObject({
      status: 'cancelled',
    });
    const cancelled = structuredClone(tables.devbox_runs);
    vi.advanceTimersByTime(60_000);
    await expect(stopDevboxRun(input)).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(tables.devbox_runs).toEqual(cancelled);
  });

  it.each(['cancel_requested', 'cancelled', 'succeeded', 'failed'])(
    'does not disclose a foreign %s run on retry',
    async (status) => {
      const foreign = tables.devbox_runs?.find((row) => row.id === 'run-other');
      if (!foreign) throw new Error('missing foreign fixture');
      foreign.status = status;
      const unchanged = structuredClone(tables.devbox_runs);
      await expectNotFound(
        stopDevboxRun({ actorId: 'owner', runId: 'run-other' })
      );
      expect(tables.devbox_runs).toEqual(unchanged);
    }
  );

  it("does not stop another member's run", async () => {
    await expectNotFound(
      stopDevboxRun({ actorId: 'owner', runId: 'run-other' })
    );

    expect(runStatus('run-other')).toBe('running');
  });

  it.each(['succeeded', 'failed'])(
    'returns the final %s status without changing it',
    async (status) => {
      const unchanged = structuredClone(tables.devbox_runs);
      await expect(
        stopDevboxRun({ actorId: 'owner', runId: `run-${status}` })
      ).resolves.toMatchObject({ status });
      expect(tables.devbox_runs).toEqual(unchanged);
    }
  );

  it('returns 404 for unknown run ids', async () => {
    await expectNotFound(stopDevboxRun({ actorId: 'owner', runId: 'missing' }));
  });

  it('lists logs only for runs owned by the actor', async () => {
    await expect(
      listDevboxRunLogs({ actorId: 'owner', runId: 'run-running' })
    ).resolves.toEqual({ logs: ['hello'] });
    await expectNotFound(
      listDevboxRunLogs({ actorId: 'owner', runId: 'run-other' })
    );
    await expectNotFound(
      listDevboxRunLogs({ actorId: 'owner', runId: 'missing' })
    );
  });

  it('releases only leases owned by the actor', async () => {
    await expect(
      releaseDevboxLease({ actorId: 'owner', leaseId: 'lease-active' })
    ).resolves.toEqual({ message: 'Devbox lease lease-active released.' });
    expect(tables.devbox_leases?.[0]?.status).toBe('released');

    await expectNotFound(
      releaseDevboxLease({ actorId: 'other', leaseId: 'lease-released' })
    );
    await expectNotFound(
      releaseDevboxLease({ actorId: 'owner', leaseId: 'missing' })
    );
  });

  it('keeps repeated owner releases idempotent without rewriting them', async () => {
    await expect(
      releaseDevboxLease({ actorId: 'owner', leaseId: 'lease-released' })
    ).resolves.toEqual({ message: 'Devbox lease lease-released released.' });

    expect(tables.devbox_leases?.[1]?.released_at).toBeUndefined();
  });
});
