import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { DEVBOX_RUN_LOG_PAGE_SIZE, listDevboxRunLogs } from './store';
import { DevboxStoreError } from './store-utils';

type Event = {
  created_at: string;
  id: string;
  message: string;
  run_id: string;
  seq?: number;
};

// In-memory PostgREST builder over the rows a reader can currently see
// (committed rows). It honours both the cursor query and the legacy
// created_at/id offset query, so tests compare real paging behaviour.
type Cursor = { legacy_numbered: number; legacy_rows: number } | null;

function createEventsTable(options: { seqColumn: boolean; cursor?: Cursor }) {
  const cursor =
    options.cursor === undefined
      ? { legacy_numbered: 0, legacy_rows: 0 }
      : options.cursor;
  const committed: Event[] = [];
  const calls: string[] = [];
  const from = (table: string) => {
    const filters: ((row: Event) => boolean)[] = [];
    const orders: string[] = [];
    let columns = '';
    const visible = () => {
      const source =
        table === 'devbox_runs'
          ? [{ actor_id: 'owner', id: 'run-1' } as unknown as Event]
          : table === 'devbox_run_event_cursors'
            ? cursor
              ? [{ run_id: 'run-1', ...cursor } as unknown as Event]
              : []
            : committed;
      const rows = source.filter((row) =>
        filters.every((filter) => filter(row))
      );
      return rows.sort((a, b) => {
        for (const column of orders) {
          const left = a[column as keyof Event] ?? '';
          const right = b[column as keyof Event] ?? '';
          if (left < right) return -1;
          if (left > right) return 1;
        }
        return 0;
      });
    };
    const missingSeq = () =>
      !options.seqColumn &&
      (table === 'devbox_run_event_cursors' ||
        (table === 'devbox_run_events' &&
          (columns.includes('seq') || orders.includes('seq'))));
    const result = (data: unknown[]) =>
      Promise.resolve(
        missingSeq()
          ? {
              data: null,
              error: {
                message: 'column devbox_run_events.seq does not exist',
              },
            }
          : { data, error: null }
      );
    const builder = {
      eq(column: string, value: string) {
        filters.push((row) => row[column as keyof Event] === value);
        return builder;
      },
      gt(column: string, value: number) {
        filters.push((row) => Number(row[column as keyof Event]) > value);
        return builder;
      },
      order(column: string) {
        orders.push(column);
        return builder;
      },
      limit(count: number) {
        calls.push(`${table}:limit`);
        return result(visible().slice(0, count));
      },
      range(start: number, end: number) {
        calls.push(`${table}:range`);
        return result(visible().slice(start, end + 1));
      },
      select(selected: string) {
        columns = selected;
        return builder;
      },
    };
    return builder;
  };
  return { calls, committed, client: { from } };
}

async function drain(offset: number) {
  const page = await listDevboxRunLogs({
    actorId: 'owner',
    offset,
    runId: 'run-1',
  });
  return page;
}

describe('devbox run log paging', () => {
  let table: ReturnType<typeof createEventsTable>;
  const event = (message: string, createdAt: string, seq?: number) => ({
    created_at: createdAt,
    id: `id-${message}`,
    message,
    run_id: 'run-1',
    ...(seq === undefined ? {} : { seq }),
  });
  const useTable = (seqColumn: boolean, cursor?: Cursor) => {
    table = createEventsTable({ seqColumn, cursor });
    createAdminClientMock.mockResolvedValue({
      schema: vi.fn().mockReturnValue(table.client),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTable(true);
  });

  it('pages by the per-run sequence cursor and returns the last sequence', async () => {
    table.committed.push(
      event('one', '2026-10-24T00:00:01Z', 2001),
      event('', '2026-10-24T00:00:02Z', 2002),
      event('two', '2026-10-24T00:00:03Z', 2003),
      event('old', '2026-10-24T00:00:00Z', 2000)
    );
    await expect(drain(2000)).resolves.toEqual({
      logs: ['one', 'two'],
      next: 2003,
    });
    await expect(drain(2003)).resolves.toEqual({ logs: [], next: 2003 });
    expect(table.calls).not.toContain('devbox_run_events:range');
  });

  // Concurrent uploads: A starts first (earlier created_at) but commits after
  // B. The migration allocates sequences in commit order per run, so a seq
  // cursor sees each line once; a created_at offset repeats B and loses A.
  it('never skips or repeats a line that commits late with an earlier timestamp', async () => {
    table.committed.push(event('B', '2026-10-24T00:00:02Z', 1));
    const first = await drain(0);
    table.committed.push(event('A', '2026-10-24T00:00:01Z', 2));
    const second = await drain(first.next);
    expect([...first.logs, ...second.logs]).toEqual(['B', 'A']);
    expect(second.next).toBe(2);
  });

  it('falls back to the created_at offset before the cursor migration applies', async () => {
    useTable(false);
    table.committed.push(
      event('b', '2026-10-24T00:00:02Z'),
      event('a', '2026-10-24T00:00:01Z')
    );
    await expect(drain(0)).resolves.toEqual({ logs: ['a', 'b'], next: 2 });
    expect(table.calls).toContain('devbox_run_events:range');
  });

  it('keeps legacy paging until the backfill numbers a run, then switches', async () => {
    // Two events written before the migration (numbered 1..2 by the backfill
    // in created_at order) and one after it (seq 3).
    const legacyA = event('a', '2026-10-24T00:00:01Z');
    const legacyB = event('b', '2026-10-24T00:00:02Z');
    useTable(true, { legacy_numbered: 0, legacy_rows: 2 });
    table.committed.push(
      legacyB,
      legacyA,
      event('c', '2026-10-24T00:00:03Z', 3)
    );
    const first = await drain(0);
    expect(first).toEqual({ logs: ['a', 'b', 'c'], next: 3 });
    expect(table.calls).toContain('devbox_run_events:range');

    useTable(true, { legacy_numbered: 2, legacy_rows: 2 });
    table.committed.push(
      { ...legacyA, seq: 1 },
      { ...legacyB, seq: 2 },
      event('c', '2026-10-24T00:00:03Z', 3),
      event('d', '2026-10-24T00:00:04Z', 4)
    );
    await expect(drain(first.next)).resolves.toEqual({ logs: ['d'], next: 4 });
    expect(table.calls).not.toContain('devbox_run_events:range');
  });

  it('uses legacy paging for a run without a cursor row', async () => {
    useTable(true, null);
    table.committed.push(event('x', '2026-10-24T00:00:01Z'));
    await expect(drain(0)).resolves.toEqual({ logs: ['x'], next: 1 });
  });

  it('caps a page at the shared page size', async () => {
    for (let seq = 1; seq <= DEVBOX_RUN_LOG_PAGE_SIZE + 5; seq += 1)
      table.committed.push(event(`line-${seq}`, '2026-10-24T00:00:00Z', seq));
    const page = await drain(0);
    expect(page.logs).toHaveLength(DEVBOX_RUN_LOG_PAGE_SIZE);
    expect(page.next).toBe(DEVBOX_RUN_LOG_PAGE_SIZE);
  });

  it('does not page events for a run the actor does not own', async () => {
    await expect(
      listDevboxRunLogs({ actorId: 'other', offset: 0, runId: 'run-1' })
    ).rejects.toBeInstanceOf(DevboxStoreError);
    expect(table.calls).not.toContain('devbox_run_events:limit');
  });
});
