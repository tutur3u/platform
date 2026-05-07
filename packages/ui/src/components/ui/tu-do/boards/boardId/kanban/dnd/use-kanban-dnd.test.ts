import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import {
  mergePersonalPlacementMutationTask,
  mergeTaskIntoBoardTaskCache,
} from './use-kanban-dnd';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    display_number: 1,
    name: 'External task',
    list_id: 'source-list',
    sort_key: 1_000_000,
    created_at: '2026-05-07T00:00:00.000Z',
    labels: [{ id: 'label-local', name: 'Personal' }],
    projects: [{ id: 'project-local', name: 'Personal project' }],
    assignees: [{ id: 'user-1', user_id: 'user-1' }],
    is_personal_external: true,
    personal_board_id: 'personal-board',
    personal_list_id: 'source-list',
    personal_sort_key: 1_000_000,
    ...overrides,
  } as Task;
}

describe('mergePersonalPlacementMutationTask', () => {
  it('keeps the local mutation marker after a placement response updates the task', () => {
    const originalTask = createTask();
    const optimisticTask = createTask({
      list_id: 'target-list',
      sort_key: 1_500_000,
      personal_list_id: 'target-list',
      personal_sort_key: 1_500_000,
      _localMutationAt: 123_456,
    } as Partial<Task>);
    const responseTask = createTask({
      list_id: 'target-list',
      sort_key: 1_750_000,
      personal_list_id: 'target-list',
      personal_sort_key: 1_750_000,
      labels: [],
      projects: [],
      assignees: [],
    });

    const merged = mergePersonalPlacementMutationTask(
      originalTask,
      optimisticTask as Task & { _localMutationAt: number },
      responseTask,
      false
    );

    expect(merged).toEqual(
      expect.objectContaining({
        list_id: 'target-list',
        sort_key: 1_750_000,
        personal_sort_key: 1_750_000,
        is_personal_external_default: false,
        _localMutationAt: 123_456,
      })
    );
    expect(merged.labels).toEqual(originalTask.labels);
    expect(merged.projects).toEqual(originalTask.projects);
    expect(merged.assignees).toEqual(originalTask.assignees);
  });

  it('keeps staging moves protected when no placement response exists', () => {
    const originalTask = createTask();
    const optimisticTask = createTask({
      list_id: 'personal-external-staging:personal-board',
      sort_key: null,
      personal_list_id: null,
      personal_sort_key: null,
      is_personal_external_default: true,
      _localMutationAt: 654_321,
    } as Partial<Task>);

    const merged = mergePersonalPlacementMutationTask(
      originalTask,
      optimisticTask as Task & { _localMutationAt: number },
      undefined,
      true
    );

    expect(merged).toEqual(
      expect.objectContaining({
        list_id: 'personal-external-staging:personal-board',
        sort_key: null,
        personal_sort_key: null,
        is_personal_external_default: true,
        _localMutationAt: 654_321,
      })
    );
  });
});

describe('mergeTaskIntoBoardTaskCache', () => {
  it('updates an existing task in the board cache', () => {
    const existingTask = createTask({ list_id: 'source-list' });
    const nextTask = createTask({
      list_id: 'target-list',
      personal_list_id: 'target-list',
      personal_sort_key: 2_000_000,
    });

    expect(mergeTaskIntoBoardTaskCache([existingTask], nextTask)).toEqual([
      expect.objectContaining({
        id: existingTask.id,
        list_id: 'target-list',
        personal_list_id: 'target-list',
        personal_sort_key: 2_000_000,
      }),
    ]);
  });

  it('adds a moved task when a stale board cache no longer contains it', () => {
    const otherTask = createTask({ id: 'other-task' });
    const movedTask = createTask({
      id: 'task-1',
      list_id: 'target-list',
      personal_list_id: 'target-list',
    });

    expect(mergeTaskIntoBoardTaskCache([otherTask], movedTask)).toEqual([
      otherTask,
      expect.objectContaining({
        id: 'task-1',
        list_id: 'target-list',
        personal_list_id: 'target-list',
      }),
    ]);
  });
});
