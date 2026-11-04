const readScope = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/utils/task-read-scope', () => ({
  loadTaskReadScope: readScope,
}));

import { beforeEach, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import { executeGetTask, executeSearchTasks } from './task-read';

beforeEach(() => {
  readScope.mockReset();
  readScope.mockResolvedValue({ mode: 'workspace' });
});

it('keeps board-only search results while enforcing both parent visibility paths', async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const data = [{ id: 'board-only', board_id: 'board', list_id: null }];
  const builder: Record<string, unknown> = {};
  for (const method of [
    'select',
    'eq',
    'is',
    'or',
    'ilike',
    'order',
    'range',
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: Supabase queries are awaitable.
  builder.then = (resolve: (result: unknown) => unknown) =>
    Promise.resolve({ data, count: 1, error: null }).then(resolve);
  const ctx = {
    wsId: 'workspace',
    supabase: { from: vi.fn(() => builder) },
  } as unknown as MiraToolContext;
  expect(await executeSearchTasks({ query: '100%_done' }, ctx)).toMatchObject({
    tasks: data,
    total: 1,
  });
  expect(calls).toContainEqual(['eq', 'direct_board.ws_id', 'workspace']);
  expect(calls).toContainEqual([
    'eq',
    'task_lists.workspace_boards.ws_id',
    'workspace',
  ]);
  expect(calls).toContainEqual(['eq', 'task_lists.deleted', false]);
  expect(calls).toContainEqual(['is', 'direct_board.archived_at', null]);
  expect(calls.filter(([method]) => method === 'or')).toEqual([
    [
      'or',
      'and(direct_board.not.is.null,list_id.is.null),and(direct_board.not.is.null,task_lists.not.is.null),and(board_id.is.null,task_lists.not.is.null)',
    ],
  ]);
  expect(calls).toContainEqual(['ilike', 'name', '%100\\%\\_done%']);
});
it('rejects a blank search without querying tasks', async () => {
  const from = vi.fn();
  const ctx = {
    wsId: 'workspace',
    supabase: { from },
  } as unknown as MiraToolContext;
  expect(await executeSearchTasks({ query: '  ' }, ctx)).toHaveProperty(
    'error'
  );
  expect(from).not.toHaveBeenCalled();
});

it('authorizes the final detail read atomically through workspace parents', async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'or'])
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  const from = vi.fn(() => builder);
  const ctx = {
    wsId: 'workspace',
    supabase: { from },
  } as unknown as MiraToolContext;
  expect(await executeGetTask({ taskId: 'moved-task' }, ctx)).toHaveProperty(
    'error'
  );
  expect(from).toHaveBeenCalledOnce();
  expect(calls).toContainEqual(['eq', 'id', 'moved-task']);
  expect(calls).toContainEqual(['eq', 'direct_board.ws_id', 'workspace']);
  expect(calls).toContainEqual([
    'eq',
    'task_lists.workspace_boards.ws_id',
    'workspace',
  ]);
  expect(calls).toContainEqual([
    'or',
    'direct_board.not.is.null,and(board_id.is.null,task_lists.not.is.null)',
  ]);
});

it.each(['detail', 'search'])(
  'denies guest %s reads when no boards are shared',
  async (operation) => {
    readScope.mockResolvedValue({ mode: 'boards', boardIds: [] });
    const from = vi.fn(() => {
      throw new Error('Unauthorized task query');
    });
    const ctx = {
      wsId: 'workspace',
      userId: 'guest',
      supabase: { from },
    } as unknown as MiraToolContext;
    const result =
      operation === 'detail'
        ? await executeGetTask({ taskId: 'private-task' }, ctx)
        : await executeSearchTasks({ query: 'Private' }, ctx);
    expect(result).toHaveProperty('error');
    expect(from).not.toHaveBeenCalled();
  }
);

it.each(['detail', 'search'])(
  'restricts guest %s reads to shared boards in the query',
  async (operation) => {
    readScope.mockResolvedValue({ mode: 'boards', boardIds: ['shared-board'] });
    const calls: Array<[string, ...unknown[]]> = [];
    const builder: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'is',
      'or',
      'in',
      'ilike',
      'order',
      'range',
    ]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    // biome-ignore lint/suspicious/noThenProperty: Supabase queries are awaitable.
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
    const ctx = {
      wsId: 'workspace',
      userId: 'guest',
      supabase: { from: () => builder },
    } as unknown as MiraToolContext;
    if (operation === 'detail')
      await executeGetTask({ taskId: 'private-task' }, ctx);
    else await executeSearchTasks({ query: 'Private' }, ctx);
    expect(calls).toContainEqual(['in', 'direct_board.id', ['shared-board']]);
    expect(calls).toContainEqual([
      'in',
      'task_lists.workspace_boards.id',
      ['shared-board'],
    ]);
  }
);
