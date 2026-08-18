import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import {
  insertOptimisticTaskIntoBoardCaches,
  reconcileOptimisticTaskInBoardCaches,
  removeOptimisticTaskFromBoardCaches,
} from '../task-helper/optimistic-task-cache';

function task(
  id: string,
  listId = 'list-1',
  overrides: Partial<Task> = {}
): Task {
  return {
    assignees: [],
    created_at: '2026-08-14T00:00:00.000Z',
    id,
    labels: [],
    list_id: listId,
    name: id,
    projects: [],
    ...overrides,
  } as unknown as Task;
}

describe('optimistic task creation cache lifecycle', () => {
  it('inserts the pending task into the board and every mounted full-task variant', () => {
    const queryClient = new QueryClient();
    const boardId = 'board-1';
    const existingTask = task('existing', 'list-1', { sort_key: 1_000_000 });
    const optimisticTask = {
      ...task('optimistic-1'),
      _isOptimistic: true,
    } as Task;

    queryClient.setQueryData(['tasks', boardId], [existingTask]);
    queryClient.setQueryData(['tasks-full', boardId], [existingTask]);
    queryClient.setQueryData(
      ['tasks-full', boardId, 'filtered'],
      [existingTask]
    );
    queryClient.setQueryData(['tasks-full', 'another-board'], [existingTask]);

    insertOptimisticTaskIntoBoardCaches(queryClient, boardId, optimisticTask);

    expect(queryClient.getQueryData(['tasks', boardId])).toEqual([
      expect.objectContaining({
        id: optimisticTask.id,
        sort_key: expect.any(Number),
      }),
      existingTask,
    ]);
    expect(queryClient.getQueryData(['tasks-full', boardId])).toEqual([
      expect.objectContaining({
        id: optimisticTask.id,
        sort_key: expect.any(Number),
      }),
      existingTask,
    ]);
    expect(
      queryClient.getQueryData(['tasks-full', boardId, 'filtered'])
    ).toEqual([
      expect.objectContaining({
        id: optimisticTask.id,
        sort_key: expect.any(Number),
      }),
      existingTask,
    ]);
    expect(queryClient.getQueryData(['tasks-full', 'another-board'])).toEqual([
      existingTask,
    ]);
  });

  it('orders consecutive optimistic creates above mixed local and placed external tasks', () => {
    const queryClient = new QueryClient();
    const boardId = 'board-1';
    const localTask = task('local', 'list-1', { sort_key: 1_000_000 });
    const externalTask = task('external', 'list-1', {
      is_personal_external: true,
      is_personal_external_default: false,
      personal_sort_key: 500_000,
      sort_key: 9_000_000,
    });
    const firstOptimisticTask = {
      ...task('optimistic-1'),
      _isOptimistic: true,
    } as Task;
    const secondOptimisticTask = {
      ...task('optimistic-2'),
      _isOptimistic: true,
    } as Task;

    queryClient.setQueryData(['tasks', boardId], [externalTask, localTask]);

    insertOptimisticTaskIntoBoardCaches(
      queryClient,
      boardId,
      firstOptimisticTask
    );
    insertOptimisticTaskIntoBoardCaches(
      queryClient,
      boardId,
      secondOptimisticTask
    );

    const tasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);
    expect(tasks?.map(({ id }) => id)).toEqual([
      'optimistic-2',
      'optimistic-1',
      'external',
      'local',
    ]);
    expect(tasks?.[0]?.sort_key).toBeLessThan(tasks?.[1]?.sort_key ?? 0);
    expect(tasks?.[1]?.sort_key).toBeLessThan(
      externalTask.personal_sort_key ?? 0
    );
  });

  it('replaces the pending task without duplicating a realtime server task', () => {
    const queryClient = new QueryClient();
    const boardId = 'board-1';
    const optimisticTask = {
      ...task('optimistic-1'),
      _isOptimistic: true,
    } as Task;
    const createdTask = task('created-1');

    queryClient.setQueryData(['tasks', boardId], [optimisticTask]);
    queryClient.setQueryData(
      ['tasks-full', boardId, 'filtered'],
      [optimisticTask, createdTask]
    );

    reconcileOptimisticTaskInBoardCaches(
      queryClient,
      boardId,
      optimisticTask.id,
      createdTask
    );

    expect(queryClient.getQueryData(['tasks', boardId])).toEqual([createdTask]);
    expect(
      queryClient.getQueryData(['tasks-full', boardId, 'filtered'])
    ).toEqual([createdTask]);
  });

  it('rolls back only the failed optimistic task', () => {
    const queryClient = new QueryClient();
    const boardId = 'board-1';
    const optimisticTask = {
      ...task('optimistic-1'),
      _isOptimistic: true,
    } as Task;
    const concurrentTask = task('concurrent');

    queryClient.setQueryData(
      ['tasks', boardId],
      [optimisticTask, concurrentTask]
    );
    queryClient.setQueryData(
      ['tasks-full', boardId, 'filtered'],
      [optimisticTask, concurrentTask]
    );

    removeOptimisticTaskFromBoardCaches(
      queryClient,
      boardId,
      optimisticTask.id
    );

    expect(queryClient.getQueryData(['tasks', boardId])).toEqual([
      concurrentTask,
    ]);
    expect(
      queryClient.getQueryData(['tasks-full', boardId, 'filtered'])
    ).toEqual([concurrentTask]);
  });
});
