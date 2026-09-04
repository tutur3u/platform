import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import {
  getPersonalPlacementOrder,
  shouldMoveExternalTaskToCompletion,
} from '../task-actions-personal-external';

const doneList = {
  id: 'personal-done',
  status: 'done',
} as TaskList;

function createTask(overrides: Partial<Task>): Task {
  return {
    created_at: '2026-08-17T00:00:00.000Z',
    id: 'task',
    list_id: 'target-list',
    name: 'Task',
    ...overrides,
  } as Task;
}

describe('getPersonalPlacementOrder', () => {
  it('appends after the last visible mixed task ordering key', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<Task[]>(
      ['tasks', 'board'],
      [
        createTask({ id: 'local', sort_key: 3_000_000 }),
        createTask({
          id: 'external',
          is_personal_external: true,
          is_personal_external_default: false,
          personal_sort_key: 4_000_000,
          sort_key: 90_000_000,
        }),
      ]
    );

    expect(
      getPersonalPlacementOrder({
        boardId: 'board',
        position: 'end',
        queryClient,
        targetListId: 'target-list',
        taskId: 'moving',
      })
    ).toEqual({
      next_task_id: null,
      personal_sort_key: 5_000_000,
      previous_task_id: 'external',
    });
  });
});

describe('shouldMoveExternalTaskToCompletion', () => {
  it('retries personal placement when the source is completed but the personal task is still active', () => {
    const task = {
      id: 'task-1',
      is_personal_external: true,
      list_id: 'personal-delegated',
      personal_board_id: 'personal-board',
      personal_list_id: 'personal-delegated',
      source_board_id: 'source-board',
      source_list_id: 'source-done',
      source_list_status: 'done',
      closed_at: '2026-08-13T00:00:00.000Z',
    } as Task;

    expect(shouldMoveExternalTaskToCompletion(task, doneList)).toBe(true);
  });

  it('does not repeat completion after the personal task reaches Done', () => {
    const task = {
      id: 'task-1',
      is_personal_external: true,
      list_id: 'personal-done',
      personal_board_id: 'personal-board',
      personal_list_id: 'personal-done',
    } as Task;

    expect(shouldMoveExternalTaskToCompletion(task, doneList)).toBe(false);
  });
});
