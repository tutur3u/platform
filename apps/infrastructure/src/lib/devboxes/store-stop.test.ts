import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { stopDevboxRun } from './store';

type Row = Record<string, unknown>;

function createRunsSchema(rows: Row[]) {
  return {
    from: () => {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Row | null = null;
      const builder = {
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        order() {
          return builder;
        },
        limit(count: number) {
          return Promise.resolve({
            data: rows
              .filter((row) => filters.every((f) => f(row)))
              .slice(0, count),
            error: null,
          });
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        select() {
          if (!patch) return builder;
          const changed = rows.filter((row) => filters.every((f) => f(row)));
          for (const row of changed) Object.assign(row, patch);
          return Promise.resolve({ data: changed, error: null });
        },
        update(value: Row) {
          patch = value;
          return builder;
        },
      };
      return builder;
    },
  };
}

describe('admin devbox run stop', () => {
  let rows: Row[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T00:00:00Z'));
    rows = [
      { id: 'queued', status: 'queued' },
      { id: 'running', status: 'running' },
      { id: 'succeeded', status: 'succeeded' },
    ];
    createAdminClientMock.mockResolvedValue({
      schema: () => createRunsSchema(rows),
    });
  });

  afterEach(() => vi.useRealTimers());

  it('cancels queued runs and requests cancellation for running runs', async () => {
    await stopDevboxRun('queued');
    await stopDevboxRun('running');

    expect(rows.map((row) => row.status)).toEqual([
      'cancelled',
      'cancel_requested',
      'succeeded',
    ]);
  });

  it.each(['queued', 'running'])(
    'keeps repeated %s stops unchanged',
    async (id) => {
      const first = await stopDevboxRun(id);
      const original = structuredClone(rows);
      vi.advanceTimersByTime(60_000);
      await expect(stopDevboxRun(id)).resolves.toEqual(first);
      expect(rows).toEqual(original);
    }
  );

  it('leaves terminal and unknown runs untouched', async () => {
    await expect(stopDevboxRun('succeeded')).resolves.toEqual({
      message: 'Devbox run succeeded succeeded.',
      status: 'succeeded',
    });
    await expect(stopDevboxRun('missing')).resolves.toEqual({
      message: 'Devbox run missing is no longer active.',
    });

    expect(rows[2]?.status).toBe('succeeded');
  });
});
