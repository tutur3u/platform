import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      let patch: Row = {};
      const builder = {
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        select() {
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
    rows = [
      { id: 'queued', status: 'queued' },
      { id: 'running', status: 'running' },
      { id: 'succeeded', status: 'succeeded' },
    ];
    createAdminClientMock.mockResolvedValue({
      schema: () => createRunsSchema(rows),
    });
  });

  it('cancels queued runs and requests cancellation for running runs', async () => {
    await stopDevboxRun('queued');
    await stopDevboxRun('running');

    expect(rows.map((row) => row.status)).toEqual([
      'cancelled',
      'cancel_requested',
      'succeeded',
    ]);
  });

  it('leaves terminal and unknown runs untouched', async () => {
    await expect(stopDevboxRun('succeeded')).resolves.toEqual({
      message: 'Devbox run succeeded is no longer active.',
    });
    await expect(stopDevboxRun('missing')).resolves.toEqual({
      message: 'Devbox run missing is no longer active.',
    });

    expect(rows[2]?.status).toBe('succeeded');
  });
});
