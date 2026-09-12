import { describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import { executeCreateTask } from './task-create';

function fixture(results: Array<{ data?: unknown; error?: unknown }>) {
  const insert = vi.fn();
  const from = vi.fn(() => {
    const result = results.shift() ?? {};
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'order', 'limit', 'not'])
      query[method] = vi.fn(() => query);
    query.insert = (value: unknown) => {
      insert(value);
      return query;
    };
    query.single = query.maybeSingle = () => Promise.resolve(result);
    // biome-ignore lint/suspicious/noThenProperty: Supabase builders are awaitable queries.
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return query;
  });
  return {
    insert,
    ctx: {
      userId: 'user',
      wsId: 'workspace',
      supabase: { from },
    } as unknown as MiraToolContext,
  };
}
const list = {
  data: {
    id: 'list',
    board_id: 'board',
    workspace_boards: { ws_id: 'workspace' },
  },
};

describe('task creation receipts', () => {
  it('saves creator and requested deadline and returns the persisted location', async () => {
    const saved = {
      id: 'task',
      name: 'Renew Netflix',
      end_date: '2026-09-14T16:59:00Z',
      task_lists: {
        id: 'list',
        name: 'Today',
        workspace_boards: { id: 'board', name: 'Tasks', ws_id: 'workspace' },
      },
    };
    const { ctx, insert } = fixture([
      list,
      { data: { id: 'task' } },
      {},
      { data: saved },
    ]);
    const result = await executeCreateTask(
      { name: 'Renew Netflix', listId: 'list', dueDate: saved.end_date },
      ctx
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: 'user',
        end_date: saved.end_date,
        list_id: 'list',
      })
    );
    expect(result).toMatchObject({
      success: true,
      task: saved,
      workspaceId: 'workspace',
      assignedToSelf: true,
    });
  });
  it('rejects a board/list mismatch without inserting', async () => {
    const { ctx, insert } = fixture([list]);
    expect(
      await executeCreateTask(
        { name: 'Test', listId: 'list', boardId: 'other' },
        ctx
      )
    ).toHaveProperty('error');
    expect(insert).not.toHaveBeenCalled();
  });
  it('never claims success when assignment fails', async () => {
    const { ctx } = fixture([
      list,
      { data: { id: 'task' } },
      { error: { message: 'Denied' } },
      { data: { id: 'task' } },
    ]);
    expect(
      await executeCreateTask({ name: 'Test', listId: 'list' }, ctx)
    ).toMatchObject({ success: false, created: true, assignedToSelf: false });
  });
  it('returns a recovery ID instead of confirming an unverified write', async () => {
    const { ctx } = fixture([
      list,
      { data: { id: 'task' } },
      {},
      { error: { message: 'Read failed' } },
    ]);
    expect(
      await executeCreateTask({ name: 'Test', listId: 'list' }, ctx)
    ).toMatchObject({ success: false, created: true, taskId: 'task' });
  });
  it('does not create defaults after a board lookup error', async () => {
    const { ctx, insert } = fixture([{ error: { message: 'Unavailable' } }]);
    expect(await executeCreateTask({ name: 'Test' }, ctx)).toEqual({
      error: 'Unavailable',
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
