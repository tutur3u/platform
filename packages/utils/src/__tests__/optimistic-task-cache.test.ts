import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import {
  insertOptimisticTaskIntoBoardCaches,
  reconcileOptimisticTaskInBoardCaches,
  removeOptimisticTaskFromBoardCaches,
} from '../task-helper/optimistic-task-cache';

function task(id: string, listId = 'list-1'): Task {
  return {
    assignees: [],
    created_at: '2026-08-14T00:00:00.000Z',
    id,
    labels: [],
    list_id: listId,
    name: id,
    projects: [],
  } as unknown as Task;
}

describe('optimistic task creation cache lifecycle', () => {
  it('inserts the pending task into the board and every mounted full-task variant', () => {
    const queryClient = new QueryClient();
    const boardId = 'board-1';
    const existingTask = task('existing');
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
      existingTask,
      optimisticTask,
    ]);
    expect(queryClient.getQueryData(['tasks-full', boardId])).toEqual([
      existingTask,
      optimisticTask,
    ]);
    expect(
      queryClient.getQueryData(['tasks-full', boardId, 'filtered'])
    ).toEqual([existingTask, optimisticTask]);
    expect(queryClient.getQueryData(['tasks-full', 'another-board'])).toEqual([
      existingTask,
    ]);
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
