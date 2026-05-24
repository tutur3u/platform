import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import {
  getProjectedTaskDropOrderFromPreview,
  getTaskDropEndPreviewFromRects,
  getTaskDropPositionFromRects,
  getTaskDropPreviewCacheTasks,
  getTaskDropPreviewFromRects,
  getTaskInsertionIndex,
  insertTaskAtDropPosition,
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

function createList(overrides: Partial<TaskList> = {}): TaskList {
  return {
    id: 'list-1',
    name: 'To Do',
    status: 'not_started',
    position: 0,
    ...overrides,
  } as TaskList;
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

describe('task drag insertion helpers', () => {
  it('places the drop before a task when the active center is above the target center', () => {
    expect(
      getTaskDropPositionFromRects({
        activeRect: { height: 80, top: 100 },
        overRect: { height: 80, top: 180 },
      })
    ).toBe('before');
  });

  it('places the drop after a task when the active center is below the target center', () => {
    expect(
      getTaskDropPositionFromRects({
        activeRect: { height: 80, top: 220 },
        overRect: { height: 80, top: 100 },
      })
    ).toBe('after');
  });

  it('places the drop after a task once the active center reaches the target center', () => {
    expect(
      getTaskDropPositionFromRects({
        activeRect: { height: 80, top: 100 },
        overRect: { height: 80, top: 100 },
      })
    ).toBe('after');
  });

  it('uses pointer position over dragged-card center for task edge decisions', () => {
    expect(
      getTaskDropPositionFromRects({
        activeRect: { height: 120, top: 180 },
        overRect: { height: 80, top: 100 },
        pointerY: 120,
      })
    ).toBe('before');
  });

  it('projects task-list surface drops to the end of the visible stack', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'source-list' });

    expect(
      getTaskDropEndPreviewFromRects({
        activeTask,
        height: 112,
        listId: 'target-list',
        rects: [
          { taskId: 'task-2', top: 100, height: 120 },
          { taskId: 'task-3', top: 232, height: 120 },
        ],
      })
    ).toEqual({
      height: 112,
      listId: 'target-list',
      overTaskId: 'task-3',
      position: 'after',
      task: activeTask,
    });
  });

  it('keeps empty-list drops as an empty preview slot', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'source-list' });

    expect(
      getTaskDropEndPreviewFromRects({
        activeTask,
        height: 112,
        listId: 'target-list',
        rects: [{ taskId: 'task-1', top: 100, height: 112 }],
      })
    ).toEqual({
      height: 112,
      listId: 'target-list',
      overTaskId: null,
      position: 'empty',
      task: activeTask,
    });
  });

  it('projects column-surface entry before the first visible task when the pointer is near the top', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'source-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeCenterY: 110,
        activeTask,
        height: 112,
        listId: 'target-list',
        rects: [
          { taskId: 'task-2', top: 100, height: 120 },
          { taskId: 'task-3', top: 232, height: 120 },
        ],
      })
    ).toEqual({
      height: 112,
      listId: 'target-list',
      overTaskId: 'task-2',
      position: 'before',
      task: activeTask,
    });
  });

  it('projects column-surface entry after the last visible task when the pointer is below the stack', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'source-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeCenterY: 380,
        activeTask,
        height: 112,
        listId: 'target-list',
        rects: [
          { taskId: 'task-2', top: 100, height: 120 },
          { taskId: 'task-3', top: 232, height: 120 },
        ],
      })
    ).toEqual({
      height: 112,
      listId: 'target-list',
      overTaskId: 'task-3',
      position: 'after',
      task: activeTask,
    });
  });

  it('keeps the preview before the next task until the dragged card center crosses it', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'target-list' });
    const expectedPreview = {
      height: 112,
      listId: 'target-list',
      overTaskId: 'task-3',
      position: 'before' as const,
      task: activeTask,
    };

    expect(
      getTaskDropPreviewFromRects({
        activeTask,
        activeTop: 232,
        height: 112,
        listId: 'target-list',
        rects: [
          { taskId: 'task-2', top: 100, height: 120 },
          { taskId: 'task-1', top: 232, height: 112 },
          { taskId: 'task-3', top: 356, height: 120 },
        ],
      })
    ).toEqual(expectedPreview);
  });

  it('uses the real dragged card center instead of recomputing from cached height', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'target-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeCenterY: 356,
        activeTask,
        activeTop: 110,
        height: 112,
        listId: 'target-list',
        rects: [
          { taskId: 'task-2', top: 100, height: 120 },
          { taskId: 'task-3', top: 232, height: 120 },
        ],
      })
    ).toEqual({
      height: 112,
      listId: 'target-list',
      overTaskId: 'task-3',
      position: 'after',
      task: activeTask,
    });
  });

  it('moves downward after a task when the dragged bottom edge crosses the task center', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'target-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 170 },
        activeTask,
        height: 100,
        initialActiveTop: 100,
        listId: 'target-list',
        rects: [
          { taskId: 'task-2', top: 220, height: 100 },
          { taskId: 'task-3', top: 340, height: 100 },
        ],
      })
    ).toEqual({
      height: 100,
      listId: 'target-list',
      overTaskId: 'task-2',
      position: 'after',
      task: activeTask,
    });
  });

  it('moves upward before a task when the dragged top edge crosses the task center', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'target-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 270 },
        activeTask,
        height: 100,
        initialActiveTop: 400,
        listId: 'target-list',
        rects: [
          { taskId: 'task-2', top: 220, height: 100 },
          { taskId: 'task-3', top: 340, height: 100 },
        ],
      })
    ).toEqual({
      height: 100,
      listId: 'target-list',
      overTaskId: 'task-2',
      position: 'before',
      task: activeTask,
    });
  });

  it('uses the current upward direction even when the card is still below its drag-start top', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'target-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeDirection: 'up',
        activeRect: { height: 100, top: 270 },
        activeTask,
        height: 100,
        initialActiveTop: 100,
        listId: 'target-list',
        rects: [
          { taskId: 'task-2', top: 220, height: 100 },
          { taskId: 'task-3', top: 340, height: 100 },
        ],
      })
    ).toEqual({
      height: 100,
      listId: 'target-list',
      overTaskId: 'task-2',
      position: 'before',
      task: activeTask,
    });
  });

  it('switches to the next slot as soon as the dragged center crosses a task center', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'target-list' });
    const rects = [
      { taskId: 'task-2', top: 100, height: 120 },
      { taskId: 'task-3', top: 232, height: 120 },
    ];

    expect(
      getTaskDropPreviewFromRects({
        activeCenterY: 291,
        activeTask,
        height: 112,
        listId: 'target-list',
        rects,
      }).position
    ).toBe('before');
    expect(
      getTaskDropPreviewFromRects({
        activeCenterY: 293,
        activeTask,
        height: 112,
        listId: 'target-list',
        rects,
      })
    ).toEqual({
      height: 112,
      listId: 'target-list',
      overTaskId: 'task-3',
      position: 'after',
      task: activeTask,
    });
  });

  it('calculates before and after insertion indexes', () => {
    const tasks = [
      createTask({ id: 'task-1' }),
      createTask({ id: 'task-2' }),
      createTask({ id: 'task-3' }),
    ];

    expect(
      getTaskInsertionIndex({
        overTaskId: 'task-2',
        position: 'before',
        tasks,
      })
    ).toBe(1);
    expect(
      getTaskInsertionIndex({
        overTaskId: 'task-2',
        position: 'after',
        tasks,
      })
    ).toBe(2);
  });

  it('reorders a same-list task without duplicating the active item', () => {
    const task1 = createTask({ id: 'task-1', list_id: 'list-1' });
    const task2 = createTask({ id: 'task-2', list_id: 'list-1' });
    const task3 = createTask({ id: 'task-3', list_id: 'list-1' });

    expect(
      insertTaskAtDropPosition({
        activeTask: task1,
        overTaskId: 'task-2',
        position: 'after',
        targetListTasks: [task1, task2, task3],
      }).map((task) => task.id)
    ).toEqual(['task-2', 'task-1', 'task-3']);
  });

  it('matches the preview slot for same-list before drops', () => {
    const task1 = createTask({ id: 'task-1', list_id: 'list-1' });
    const task2 = createTask({ id: 'task-2', list_id: 'list-1' });
    const task3 = createTask({ id: 'task-3', list_id: 'list-1' });

    expect(
      insertTaskAtDropPosition({
        activeTask: task3,
        overTaskId: 'task-2',
        position: 'before',
        targetListTasks: [task1, task2, task3],
      }).map((task) => task.id)
    ).toEqual(['task-1', 'task-3', 'task-2']);
  });

  it('inserts a cross-list task next to the hovered task', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'source-list' });
    const task2 = createTask({ id: 'task-2', list_id: 'target-list' });
    const task3 = createTask({ id: 'task-3', list_id: 'target-list' });

    expect(
      insertTaskAtDropPosition({
        activeTask,
        overTaskId: 'task-2',
        position: 'after',
        targetListTasks: [task2, task3],
      }).map((task) => task.id)
    ).toEqual(['task-2', 'task-1', 'task-3']);
  });

  it('projects same-list cache order by moving only the active task sort key', () => {
    const task1 = createTask({
      id: 'task-1',
      list_id: 'list-1',
      sort_key: 1_000_000,
    });
    const task2 = createTask({
      id: 'task-2',
      list_id: 'list-1',
      sort_key: 2_000_000,
    });
    const task3 = createTask({
      id: 'task-3',
      list_id: 'list-1',
      sort_key: 3_000_000,
    });

    const preview = getTaskDropPreviewCacheTasks({
      activeTask: task3,
      localMutationAt: 123,
      orderedTasks: [task1, task3, task2],
      tasks: [task1, task2, task3],
      targetList: createList({ id: 'list-1' }),
      targetListId: 'list-1',
    });

    const movedTask = preview.tasks?.find((task) => task.id === 'task-3');
    expect(movedTask).toEqual(
      expect.objectContaining({
        list_id: 'list-1',
        sort_key: 1_500_000,
        _localMutationAt: 123,
      })
    );
    expect(preview.tasks?.map((task) => task.id).sort()).toEqual([
      'task-1',
      'task-2',
      'task-3',
    ]);
  });

  it('projects cross-list cache order into the target list without duplicating the active task', () => {
    const activeTask = createTask({
      id: 'task-1',
      list_id: 'source-list',
      sort_key: 1_000_000,
    });
    const task2 = createTask({
      id: 'task-2',
      list_id: 'target-list',
      sort_key: 1_000_000,
    });
    const task3 = createTask({
      id: 'task-3',
      list_id: 'target-list',
      sort_key: 2_000_000,
    });

    const preview = getTaskDropPreviewCacheTasks({
      activeTask,
      localMutationAt: 456,
      orderedTasks: [task2, activeTask, task3],
      tasks: [activeTask, task2, task3],
      targetList: createList({ id: 'target-list' }),
      targetListId: 'target-list',
    });

    const movedTask = preview.tasks?.find((task) => task.id === 'task-1');
    expect(movedTask).toEqual(
      expect.objectContaining({
        list_id: 'target-list',
        sort_key: 1_500_000,
        _localMutationAt: 456,
      })
    );
    expect(preview.tasks?.filter((task) => task.id === 'task-1')).toHaveLength(
      1
    );
  });

  it('repairs dense sort keys so preview order can match the persisted order', () => {
    const activeTask = createTask({
      id: 'task-1',
      list_id: 'source-list',
      sort_key: 1000,
    });
    const task2 = createTask({
      id: 'task-2',
      list_id: 'target-list',
      sort_key: 1000,
    });
    const task3 = createTask({
      id: 'task-3',
      list_id: 'target-list',
      sort_key: 1000,
    });

    const preview = getTaskDropPreviewCacheTasks({
      activeTask,
      localMutationAt: 789,
      orderedTasks: [task2, activeTask, task3],
      tasks: [activeTask, task2, task3],
      targetList: createList({ id: 'target-list' }),
      targetListId: 'target-list',
    });

    expect(preview.repairedTaskSortKeys).toEqual([
      { listId: 'target-list', sortKey: 1_000_000, taskId: 'task-2' },
      { listId: 'target-list', sortKey: 2_000_000, taskId: 'task-1' },
      { listId: 'target-list', sortKey: 3_000_000, taskId: 'task-3' },
    ]);
    expect(
      preview.tasks
        ?.filter((task) => ['task-1', 'task-2', 'task-3'].includes(task.id))
        .sort((a, b) => (a.sort_key ?? 0) - (b.sort_key ?? 0))
        .map((task) => task.id)
    ).toEqual(['task-2', 'task-1', 'task-3']);
  });

  it('repairs small target gaps before they can make the preview order drift from persistence', () => {
    const activeTask = createTask({
      id: 'task-1',
      list_id: 'source-list',
      sort_key: 1_000_000,
    });
    const task2 = createTask({
      id: 'task-2',
      list_id: 'target-list',
      sort_key: 1_000,
    });
    const task3 = createTask({
      id: 'task-3',
      list_id: 'target-list',
      sort_key: 1_900,
    });

    const preview = getTaskDropPreviewCacheTasks({
      activeTask,
      localMutationAt: 987,
      orderedTasks: [task2, activeTask, task3],
      tasks: [activeTask, task2, task3],
      targetList: createList({ id: 'target-list' }),
      targetListId: 'target-list',
    });

    expect(preview.repairedTaskSortKeys).toEqual([
      { listId: 'target-list', sortKey: 1_000_000, taskId: 'task-2' },
      { listId: 'target-list', sortKey: 2_000_000, taskId: 'task-1' },
      { listId: 'target-list', sortKey: 3_000_000, taskId: 'task-3' },
    ]);
  });

  it('uses the last preview position as the release order source of truth', () => {
    const activeTask = createTask({
      id: 'task-1',
      list_id: 'source-list',
      sort_key: 1000,
    });
    const task2 = createTask({
      id: 'task-2',
      list_id: 'target-list',
      sort_key: 1000,
    });
    const task3 = createTask({
      id: 'task-3',
      list_id: 'target-list',
      sort_key: 2000,
    });

    expect(
      getProjectedTaskDropOrderFromPreview({
        activeTask,
        isCompletionList: false,
        preview: {
          height: 112,
          listId: 'target-list',
          overTaskId: 'task-3',
          position: 'before',
          task: activeTask,
        },
        targetListTasks: [task2, task3],
      }).map((task) => task.id)
    ).toEqual(['task-2', 'task-1', 'task-3']);
  });

  it('projects completion-list cache state when dragging into a done list', () => {
    const activeTask = createTask({
      id: 'task-1',
      list_id: 'source-list',
      sort_key: 1000,
    });

    const preview = getTaskDropPreviewCacheTasks({
      activeTask,
      localMutationAt: Date.parse('2026-05-24T00:00:00.000Z'),
      orderedTasks: [activeTask],
      tasks: [activeTask],
      targetList: createList({ id: 'done-list', status: 'done' }),
      targetListId: 'done-list',
    });

    expect(preview.tasks?.[0]).toEqual(
      expect.objectContaining({
        completed: true,
        completed_at: '2026-05-24T00:00:00.000Z',
        list_id: 'done-list',
      })
    );
  });
});
