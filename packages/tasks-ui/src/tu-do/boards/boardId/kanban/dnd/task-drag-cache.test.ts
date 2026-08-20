import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it, vi } from 'vitest';
import {
  applyTaskDropPreviewToCache,
  getPersonalPlacementDropTask,
  getTaskTerminalFieldsForList,
  mergePersonalPlacementMutationTask,
} from './task-drag-cache';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    display_number: 1,
    name: 'External task',
    list_id: 'source-list',
    sort_key: 1_000_000,
    created_at: '2026-05-07T00:00:00.000Z',
    is_personal_external: true,
    personal_board_id: 'personal-board',
    personal_list_id: 'source-list',
    personal_sort_key: 1_000_000,
    ...overrides,
  } as Task;
}

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

describe('personal placement terminal state', () => {
  it.each(['not_started', 'active', 'review'] as const)(
    'clears resolved styling when moving a task into a %s list',
    (status) => {
      expect(
        getTaskTerminalFieldsForList(
          createTask({
            completed_at: '2026-08-19T12:00:00.000Z',
            closed_at: '2026-08-19T13:00:00.000Z',
          }),
          status,
          123_456
        )
      ).toEqual({ completed: false, completed_at: null, closed_at: null });
    }
  );

  it('builds an active placement without stale completion metadata', () => {
    const moved = getPersonalPlacementDropTask({
      isStagingTarget: false,
      newSortKey: 2_000_000,
      targetBoardId: 'personal-board',
      targetList: {
        id: 'active-list',
        name: 'Active',
        status: 'active',
      } as TaskList,
      targetListId: 'active-list',
      task: createTask({
        completed_at: '2026-08-19T12:00:00.000Z',
        closed_at: '2026-08-19T13:00:00.000Z',
      }),
    });

    expect(moved).toEqual(
      expect.objectContaining({
        completed_at: null,
        closed_at: null,
        list_id: 'active-list',
        personal_list_id: 'active-list',
      })
    );
  });

  it('does not restore stale source completion state during reconciliation', () => {
    const originalTask = createTask({
      completed_at: '2026-08-19T12:00:00.000Z',
    });
    const optimisticTask = createTask({
      completed_at: null,
      closed_at: null,
      list_id: 'active-list',
      personal_list_id: 'active-list',
      _localMutationAt: 123_456,
    } as unknown as Partial<Task>);
    const staleResponseTask = createTask({
      completed_at: '2026-08-19T12:00:00.000Z',
      list_id: 'active-list',
      personal_list_id: 'active-list',
    });

    expect(
      mergePersonalPlacementMutationTask(
        originalTask,
        optimisticTask as Task & { _localMutationAt: number },
        staleResponseTask,
        false
      )
    ).toEqual(expect.objectContaining({ completed_at: null, closed_at: null }));
  });
});
