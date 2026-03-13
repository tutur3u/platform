import { describe, expect, it } from 'vitest';
import type { MiraToolContext } from '../mira-tools';
import { executeLogTransaction, executeUpdateTransaction } from './finance';
import {
  executeAddTaskAssignee,
  executeCompleteTask,
  executeListTaskLists,
  executeUpdateTask,
} from './tasks';
import { executeCreateTimeTrackingEntry } from './timer';

type QueryResult = { data?: unknown; error?: { message: string } | null };
type QueryState = {
  filters: Array<[string, string, unknown]>;
  insertPayload?: unknown;
  updatePayload?: unknown;
};

class MockSupabase {
  constructor(
    private readonly responders: Record<
      string,
      (state: QueryState) => QueryResult | Promise<QueryResult>
    >
  ) {}

  from(table: string) {
    const state: QueryState = { filters: [] };
    const respond = async () => {
      const responder = this.responders[table];
      if (!responder) {
        return { data: null, error: null };
      }

      const result = await responder(state);
      return {
        data: result.data ?? null,
        error: result.error ?? null,
      };
    };

    const makeBuilder = () =>
      Object.assign(
        Promise.resolve().then(() => respond()),
        {
          select: () => makeBuilder(),
          insert: (payload: unknown) => {
            state.insertPayload = payload;
            return makeBuilder();
          },
          update: (payload: unknown) => {
            state.updatePayload = payload;
            return makeBuilder();
          },
          delete: () => makeBuilder(),
          order: () => makeBuilder(),
          limit: () => makeBuilder(),
          eq: (column: string, value: unknown) => {
            state.filters.push(['eq', column, value]);
            return makeBuilder();
          },
          in: (column: string, value: unknown) => {
            state.filters.push(['in', column, value]);
            return makeBuilder();
          },
          gte: (column: string, value: unknown) => {
            state.filters.push(['gte', column, value]);
            return makeBuilder();
          },
          lte: (column: string, value: unknown) => {
            state.filters.push(['lte', column, value]);
            return makeBuilder();
          },
          not: (column: string, operator: unknown, value?: unknown) => {
            state.filters.push(['not', column, value ?? operator]);
            return makeBuilder();
          },
          maybeSingle: async () => respond(),
          single: async () => respond(),
        }
      );

    return makeBuilder();
  }
}

function createCtx(supabase: unknown): MiraToolContext {
  return {
    wsId: 'workspace-1',
    userId: 'user-1',
    supabase: supabase as MiraToolContext['supabase'],
    timezone: 'UTC',
  } as MiraToolContext;
}

describe('Mira executor security boundaries', () => {
  it('rejects completing a task from another workspace', async () => {
    const ctx = createCtx(
      new MockSupabase({
        tasks: () => ({ data: null, error: null }),
      })
    );

    await expect(
      executeCompleteTask({ taskId: 'task-1' }, ctx)
    ).resolves.toEqual({
      error: 'Task not found in current workspace',
    });
  });

  it('rejects moving a task into a list from another workspace', async () => {
    const ctx = createCtx(
      new MockSupabase({
        task_lists: () => ({
          data: {
            id: 'list-2',
            workspace_boards: { ws_id: 'workspace-2' },
          },
          error: null,
        }),
      })
    );

    await expect(
      executeUpdateTask({ taskId: 'task-1', listId: 'list-2' }, ctx)
    ).resolves.toEqual({
      error: 'Target list not found in current workspace',
    });
  });

  it('rejects listing lists for a board outside the current workspace', async () => {
    const ctx = createCtx(
      new MockSupabase({
        workspace_boards: () => ({ data: null, error: null }),
      })
    );

    await expect(
      executeListTaskLists({ boardId: 'board-2' }, ctx)
    ).resolves.toEqual({
      error: 'Board not found in current workspace',
    });
  });

  it('rejects assigning a non-member to a task', async () => {
    const ctx = createCtx(
      new MockSupabase({
        tasks: () => ({
          data: { id: 'task-1', board_id: 'board-1', list_id: 'list-1' },
          error: null,
        }),
        workspace_boards: () => ({
          data: { id: 'board-1' },
          error: null,
        }),
        workspace_members: () => ({ data: null, error: null }),
      })
    );

    await expect(
      executeAddTaskAssignee({ taskId: 'task-1', userId: 'user-2' }, ctx)
    ).resolves.toEqual({
      error: 'Assignee is not a member of the current workspace',
    });
  });

  it('rejects logging a transaction into a wallet from another workspace', async () => {
    const ctx = createCtx(
      new MockSupabase({
        workspace_wallets: () => ({ data: null, error: null }),
      })
    );

    await expect(
      executeLogTransaction({ amount: 10, walletId: 'wallet-2' }, ctx)
    ).resolves.toEqual({
      error: 'Wallet not found in current workspace',
    });
  });

  it('rejects updating a transaction to use a foreign wallet', async () => {
    const ctx = createCtx(
      new MockSupabase({
        workspace_wallets: () => ({ data: null, error: null }),
      })
    );

    await expect(
      executeUpdateTransaction(
        {
          transactionId: 'tx-1',
          walletId: 'wallet-2',
        },
        ctx
      )
    ).resolves.toEqual({
      error: 'Wallet not found in current workspace',
    });
  });

  it('rejects manual time entries that reference a task outside the current workspace', async () => {
    const ctx = createCtx(
      new MockSupabase({
        workspace_settings: () => ({
          data: { missed_entry_date_threshold: null },
          error: null,
        }),
        tasks: () => ({ data: null, error: null }),
      })
    );

    await expect(
      executeCreateTimeTrackingEntry(
        {
          title: 'Work',
          date: '2026-03-13',
          startTime: '08:00',
          endTime: '09:00',
          taskId: 'task-2',
        },
        ctx
      )
    ).resolves.toEqual({
      error: 'Task not found in current workspace',
    });
  });
});
