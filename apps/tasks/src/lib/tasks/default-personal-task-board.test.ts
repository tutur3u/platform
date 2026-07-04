import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PERSONAL_TASK_BOARD_NAME,
  ensureDefaultPersonalTaskBoard,
} from './default-personal-task-board';

type Board = {
  archived_at: string | null;
  created_at: string | null;
  deleted_at: string | null;
  id: string;
  name: string;
  ws_id: string;
};

type Workspace = {
  id: string;
  personal: boolean;
};

type QueryResult<T> = {
  data: T;
  error: unknown;
};

type BoardFilter =
  | { column: string; type: 'eq'; value: unknown }
  | { column: string; type: 'is'; value: unknown };

function createBoardSelectQuery(result: QueryResult<Board[]>) {
  const filters: BoardFilter[] = [];
  let maxRows: number | null = null;

  const applyFilters = () => {
    if (result.error) return result;

    let rows = result.data;
    for (const filter of filters) {
      rows = rows.filter((row) => {
        const actual = (row as Record<string, unknown>)[filter.column];

        if (filter.type === 'is') {
          return filter.value === null
            ? actual === null
            : actual === filter.value;
        }

        return actual === filter.value;
      });
    }

    return {
      data: maxRows === null ? rows : rows.slice(0, maxRows),
      error: null,
    };
  };

  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, type: 'eq', value });
      return query;
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push({ column, type: 'is', value });
      return query;
    }),
    limit: vi.fn((limit: number) => {
      maxRows = limit;
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      const filtered = applyFilters();
      if (filtered.error) return filtered;

      return {
        data: filtered.data[0] ?? null,
        error: null,
      };
    }),
    order: vi.fn(() => query),
  };

  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: QueryResult<Board[]>) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(applyFilters()).then(resolve, reject),
  });

  return query;
}

function createTestClient({
  boardReads = [],
  insertResults = [],
  workspace,
}: {
  boardReads?: QueryResult<Board[]>[];
  insertResults?: QueryResult<Board | null>[];
  workspace: QueryResult<Workspace | null>;
}) {
  const boardQueries: ReturnType<typeof createBoardSelectQuery>[] = [];
  const boardSelect = vi.fn(() => {
    const query = createBoardSelectQuery(
      boardReads.shift() ?? { data: [], error: null }
    );
    boardQueries.push(query);
    return query;
  });
  const insert = vi.fn((payload: unknown) => ({
    select: vi.fn(() => ({
      single: vi.fn(
        async () => insertResults.shift() ?? { data: null, error: null }
      ),
    })),
    payload,
  }));
  const workspaceMaybeSingle = vi.fn(async () => workspace);
  const workspaceEq = vi.fn(() => ({
    maybeSingle: workspaceMaybeSingle,
  }));
  const workspaceSelect = vi.fn(() => ({
    eq: workspaceEq,
  }));
  const from = vi.fn((table: string) => {
    if (table === 'workspaces') {
      return {
        select: workspaceSelect,
      };
    }

    if (table === 'workspace_boards') {
      return {
        insert,
        select: boardSelect,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from } as unknown as TypedSupabaseClient,
    from,
    insert,
    boardQueries,
    boardSelect,
    workspaceMaybeSingle,
  };
}

function createBoard(overrides: Partial<Board> = {}): Board {
  return {
    archived_at: null,
    created_at: '2026-06-29T00:00:00.000Z',
    deleted_at: null,
    id: 'board-1',
    name: DEFAULT_PERSONAL_TASK_BOARD_NAME,
    ws_id: 'ws-1',
    ...overrides,
  };
}

describe('ensureDefaultPersonalTaskBoard', () => {
  it('returns null for non-personal workspaces', async () => {
    const setup = createTestClient({
      workspace: { data: { id: 'ws-1', personal: false }, error: null },
    });

    await expect(
      ensureDefaultPersonalTaskBoard({
        sbAdmin: setup.client,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toBeNull();

    expect(setup.boardSelect).not.toHaveBeenCalled();
    expect(setup.insert).not.toHaveBeenCalled();
  });

  it('reuses an existing active default personal board', async () => {
    const existingBoard = createBoard({ id: 'board-active' });
    const setup = createTestClient({
      boardReads: [{ data: [existingBoard], error: null }],
      workspace: { data: { id: 'ws-1', personal: true }, error: null },
    });

    await expect(
      ensureDefaultPersonalTaskBoard({
        sbAdmin: setup.client,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toBe(existingBoard);

    expect(setup.insert).not.toHaveBeenCalled();
  });

  it('treats an archived non-deleted default-name board as occupying the default name', async () => {
    const archivedBoard = createBoard({
      archived_at: '2026-06-01T00:00:00.000Z',
      id: 'board-archived',
      name: ' tasks ',
    });
    const setup = createTestClient({
      boardReads: [{ data: [archivedBoard], error: null }],
      workspace: { data: { id: 'ws-1', personal: true }, error: null },
    });

    await expect(
      ensureDefaultPersonalTaskBoard({
        sbAdmin: setup.client,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toBe(archivedBoard);

    expect(setup.insert).not.toHaveBeenCalled();
  });

  it('recovers a duplicate insert race by re-reading the default board', async () => {
    const racedBoard = createBoard({ id: 'board-race' });
    const conflict = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    };
    const setup = createTestClient({
      boardReads: [
        { data: [], error: null },
        { data: [racedBoard], error: null },
      ],
      insertResults: [{ data: null, error: conflict }],
      workspace: { data: { id: 'ws-1', personal: true }, error: null },
    });

    await expect(
      ensureDefaultPersonalTaskBoard({
        sbAdmin: setup.client,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toBe(racedBoard);

    expect(setup.insert).toHaveBeenCalledWith({
      creator_id: 'user-1',
      name: DEFAULT_PERSONAL_TASK_BOARD_NAME,
      ws_id: 'ws-1',
    });
    expect(setup.boardSelect).toHaveBeenCalledTimes(2);
  });

  it('throws an unresolved duplicate insert error', async () => {
    const conflict = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    };
    const setup = createTestClient({
      boardReads: [
        { data: [], error: null },
        { data: [], error: null },
      ],
      insertResults: [{ data: null, error: conflict }],
      workspace: { data: { id: 'ws-1', personal: true }, error: null },
    });

    await expect(
      ensureDefaultPersonalTaskBoard({
        sbAdmin: setup.client,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).rejects.toBe(conflict);

    expect(setup.boardSelect).toHaveBeenCalledTimes(2);
  });

  it('throws non-unique insert errors without re-reading', async () => {
    const insertError = {
      code: '42501',
      message: 'permission denied',
    };
    const setup = createTestClient({
      boardReads: [{ data: [], error: null }],
      insertResults: [{ data: null, error: insertError }],
      workspace: { data: { id: 'ws-1', personal: true }, error: null },
    });

    await expect(
      ensureDefaultPersonalTaskBoard({
        sbAdmin: setup.client,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).rejects.toBe(insertError);

    expect(setup.boardSelect).toHaveBeenCalledTimes(1);
  });
});
