import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it, vi } from 'vitest';
import { applyTaskDropPreviewToCache } from './task-drag-cache';

describe('applyTaskDropPreviewToCache', () => {
  it('keeps an external task destination preview while stale fetches cancel', () => {
    const queryClient = new QueryClient();
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');
    const boardId = 'board-1';
    const activeTask = {
      id: 'task-1',
      display_number: 1,
      name: 'External task',
      list_id: 'source-list',
      sort_key: 1_000_000,
      created_at: '2026-08-13T00:00:00.000Z',
      is_personal_external: true,
      personal_list_id: 'source-list',
      personal_sort_key: 1_000_000,
    } as Task;
    const targetList = {
      id: 'target-list',
      name: 'In progress',
      position: 1,
      status: 'active',
    } as TaskList;
    const snapshot = {
      fullTasks: [activeTask],
      tasks: [activeTask],
    };

    queryClient.setQueryData(['tasks', boardId], snapshot.tasks);
    queryClient.setQueryData(['tasks-full', boardId], snapshot.fullTasks);
    queryClient.setQueryData(
      ['tasks-full', boardId, 'filtered-query'],
      snapshot.fullTasks
    );

    applyTaskDropPreviewToCache({
      activeTask,
      boardId,
      orderedTasks: [activeTask],
      queryClient,
      snapshot,
      targetList,
      targetListId: targetList.id,
    });

    expect(cancelQueries).toHaveBeenCalledWith(
      { queryKey: ['tasks', boardId] },
      { revert: false }
    );
    expect(cancelQueries).toHaveBeenCalledWith(
      { queryKey: ['tasks-full', boardId] },
      { revert: false }
    );
    expect(queryClient.getQueryData<Task[]>(['tasks', boardId])?.[0]).toEqual(
      expect.objectContaining({ list_id: targetList.id })
    );
    expect(
      queryClient.getQueryData<Task[]>([
        'tasks-full',
        boardId,
        'filtered-query',
      ])?.[0]
    ).toEqual(expect.objectContaining({ list_id: targetList.id }));
  });
});
