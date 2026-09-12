import { expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import { executeSearchTasks } from './task-read';

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
