import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import { getTaskDropPreviewCacheTasks } from './task-drag-cache';
import {
  getProjectedTaskDropOrderFromPreview,
  sortTasksForList,
} from './task-drag-order';

function createTask(
  id: string,
  sortKey: number,
  overrides: Partial<Task> = {}
): Task {
  return {
    created_at: `2026-08-17T00:00:0${id.at(-1) ?? '0'}.000Z`,
    id,
    list_id: 'list-1',
    name: id,
    sort_key: sortKey,
    ...overrides,
  } as Task;
}

const activeList = {
  id: 'list-1',
  name: 'Active',
  status: 'active',
} as TaskList;

describe('mixed task drag order', () => {
  it('sorts native and placed external tasks by their effective ordering keys', () => {
    const tasks = [
      createTask('task-3', 3_000_000),
      createTask('task-2', 99_000_000, {
        is_personal_external: true,
        personal_sort_key: 2_000_000,
      }),
      createTask('task-1', 1_000_000),
    ];

    expect(
      sortTasksForList({
        disableSort: false,
        targetList: activeList,
        tasks,
      }).map((task) => task.id)
    ).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('projects the exact preview slot without duplicating a same-list task', () => {
    const tasks = [
      createTask('task-1', 1_000_000),
      createTask('task-2', 2_000_000, {
        is_personal_external: true,
        personal_sort_key: 2_000_000,
      }),
      createTask('task-3', 3_000_000),
      createTask('task-4', 4_000_000),
    ];

    expect(
      getProjectedTaskDropOrderFromPreview({
        activeTask: tasks[1]!,
        isCompletionList: false,
        preview: {
          height: 96,
          insertionIndex: 3,
          listId: 'list-1',
          task: tasks[1]!,
        },
        targetListTasks: tasks,
      }).map((task) => task.id)
    ).toEqual(['task-1', 'task-3', 'task-4', 'task-2']);
  });

  it('assigns a personal sort key that preserves an external task preview between native tasks', () => {
    const first = createTask('task-1', 1_000_000);
    const active = createTask('task-2', 50_000_000, {
      is_personal_external: true,
      personal_sort_key: 50_000_000,
    });
    const last = createTask('task-3', 3_000_000);
    const orderedTasks = [first, active, last];

    const result = getTaskDropPreviewCacheTasks({
      activeTask: active,
      localMutationAt: 1,
      orderedTasks,
      tasks: [active, last, first],
      targetList: activeList,
      targetListId: 'list-1',
    });
    const updatedActive = result.tasks?.find((task) => task.id === active.id);

    expect(updatedActive?.personal_sort_key).toBe(2_000_000);
    expect(
      sortTasksForList({
        disableSort: false,
        targetList: activeList,
        tasks: result.tasks ?? [],
      }).map((task) => task.id)
    ).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('reconciles dense mixed keys into the exact projected order', () => {
    const first = createTask('task-1', 1_000_000);
    const active = createTask('task-2', 9_000_000, {
      is_personal_external: true,
      personal_sort_key: 9_000_000,
    });
    const external = createTask('task-3', 50_000_000, {
      is_personal_external: true,
      personal_sort_key: 1_000_001,
    });
    const last = createTask('task-4', 1_000_002);
    const orderedTasks = [first, active, external, last];

    const result = getTaskDropPreviewCacheTasks({
      activeTask: active,
      localMutationAt: 1,
      orderedTasks,
      tasks: [external, last, active, first],
      targetList: activeList,
      targetListId: 'list-1',
    });

    expect(result.repairedTaskSortKeys).toEqual([
      { listId: 'list-1', sortKey: 1_000_000, taskId: 'task-1' },
      { listId: 'list-1', sortKey: 2_000_000, taskId: 'task-2' },
      { listId: 'list-1', sortKey: 3_000_000, taskId: 'task-3' },
      { listId: 'list-1', sortKey: 4_000_000, taskId: 'task-4' },
    ]);
    expect(
      sortTasksForList({
        disableSort: false,
        targetList: activeList,
        tasks: result.tasks ?? [],
      }).map((task) => task.id)
    ).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);
  });
});
