import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCreateTaskSortKey } from './create-sort-key';

type QueryResult = { data: unknown; error: unknown | null };
type QueryRecord = { calls: [string, unknown[]][]; table: string };

function createAdminClient(queues: Map<string, QueryResult[]>) {
  const records: QueryRecord[] = [];
  const from = vi.fn((table: string) => {
    const result = queues.get(table)?.shift() ?? { data: [], error: null };
    const record = { calls: [] as [string, unknown[]][], table };
    const query = {
      eq: vi.fn((...args: unknown[]) => {
        record.calls.push(['eq', args]);
        return query;
      }),
      is: vi.fn((...args: unknown[]) => {
        record.calls.push(['is', args]);
        return query;
      }),
      limit: vi.fn((...args: unknown[]) => {
        record.calls.push(['limit', args]);
        return query;
      }),
      maybeSingle: vi.fn(async () => result),
      not: vi.fn((...args: unknown[]) => {
        record.calls.push(['not', args]);
        return query;
      }),
      order: vi.fn((...args: unknown[]) => {
        record.calls.push(['order', args]);
        return query;
      }),
      select: vi.fn((...args: unknown[]) => {
        record.calls.push(['select', args]);
        return query;
      }),
      update: vi.fn((...args: unknown[]) => {
        record.calls.push(['update', args]);
        return query;
      }),
    };
    Object.defineProperty(query, 'then', {
      value: (
        resolve: (value: QueryResult) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    });
    records.push(record);
    return query;
  });

  return { client: { from } as never, records };
}

function queue(
  queues: Map<string, QueryResult[]>,
  table: string,
  data: unknown
) {
  queues.set(table, [...(queues.get(table) ?? []), { data, error: null }]);
}

const context = {
  boardId: 'board-1',
  listId: 'list-1',
  userId: 'user-1',
};

describe('create task effective sort keys', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('places a native create ahead of a leading external placement', async () => {
    const queues = new Map<string, QueryResult[]>();
    queue(queues, 'tasks', { sort_key: 1_000_000 });
    queue(queues, 'task_user_overrides', { personal_sort_key: 500_000 });
    const { client } = createAdminClient(queues);

    const result = await resolveCreateTaskSortKey(client, context);

    expect(result.error).toBeNull();
    expect(result.sortKey).toBeGreaterThan(0);
    expect(result.sortKey).toBeLessThan(500_000);
  });

  it('renormalizes native and external keys together when the top gap is exhausted', async () => {
    const queues = new Map<string, QueryResult[]>();
    queue(queues, 'tasks', { sort_key: 2 });
    queue(queues, 'tasks', [
      {
        created_at: '2026-08-18T00:00:00.000Z',
        id: 'native-1',
        sort_key: 2,
      },
    ]);
    queue(queues, 'tasks', null);
    queue(queues, 'tasks', { sort_key: 2_000_000 });
    queue(queues, 'task_user_overrides', { personal_sort_key: 1 });
    queue(queues, 'task_user_overrides', [
      {
        created_at: '2026-08-17T00:00:00.000Z',
        personal_placed_at: '2026-08-17T00:00:00.000Z',
        personal_sort_key: 1,
        task_id: 'external-1',
      },
    ]);
    queue(queues, 'task_user_overrides', null);
    queue(queues, 'task_user_overrides', { personal_sort_key: 1_000_000 });
    const { client, records } = createAdminClient(queues);

    const result = await resolveCreateTaskSortKey(client, context);

    expect(result.error).toBeNull();
    expect(result.sortKey).toBeGreaterThan(0);
    expect(result.sortKey).toBeLessThan(1_000_000);
    expect(
      records
        .filter(({ table }) => table === 'task_user_overrides')
        .flatMap(({ calls }) => calls)
    ).toContainEqual(['update', [{ personal_sort_key: 1_000_000 }]]);
    expect(
      records
        .filter(({ table }) => table === 'tasks')
        .flatMap(({ calls }) => calls)
    ).toContainEqual(['update', [{ sort_key: 2_000_000 }]]);
  });
});
