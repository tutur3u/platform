import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/utils/task-helper', () => {
  const prefix = 'personal-external-staging:';

  return {
    getPersonalExternalStagingBoardId: (listId: string | null) =>
      listId?.startsWith(prefix) && listId.length > prefix.length
        ? listId.slice(prefix.length)
        : null,
    getPersonalExternalStagingListId: (boardId: string) =>
      `${prefix}${boardId}`,
    isPersonalExternalStagingListId: (listId: string | null) =>
      Boolean(listId?.startsWith(prefix) && listId.length > prefix.length),
  };
});

import {
  applyTaskDropPreviewToCache,
  getProjectedTaskDropOrderFromPreview,
  getTaskDropEndPreviewFromRects,
  getTaskDropPositionFromRects,
  getTaskDropPreviewCacheTasks,
  getTaskDropPreviewFromRects,
  getTaskInsertionIndex,
  hasTaskLocalMutationAt,
  insertTaskAtDropPosition,
  mergePersonalPlacementMutationTask,
  mergeTaskIntoBoardTaskCache,
  usesPersonalPlacement,
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

describe('usesPersonalPlacement', () => {
  it('does not treat a personal-workspace task as external from personal_board_id alone', () => {
    const personalTask = createTask({
      is_personal_external: false,
      personal_board_id: 'personal-board',
      personal_list_id: 'list-1',
      source_board_id: null,
      source_list_id: null,
      source_workspace_id: null,
    } as Partial<Task>);

    expect(usesPersonalPlacement(personalTask)).toBe(false);
  });

  it('keeps explicit external overlays on the personal-placement path', () => {
    expect(usesPersonalPlacement(createTask())).toBe(true);
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
          { taskId: 'task-2', top: 100, height: 120, originalIndex: 0 },
          { taskId: 'task-3', top: 232, height: 120, originalIndex: 1 },
        ],
      })
    ).toEqual({
      height: 112,
      insertionIndex: 2,
      listId: 'target-list',
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
        rects: [{ taskId: 'task-1', top: 100, height: 112, originalIndex: 0 }],
      })
    ).toEqual({
      height: 112,
      insertionIndex: 0,
      listId: 'target-list',
      task: activeTask,
    });
  });

  it('keeps same-list preview at the original index before midpoint crossing', () => {
    const activeTask = createTask({ id: 'task-2', list_id: 'target-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 210 },
        activeTask,
        dragSession: {
          activeInitialRect: { height: 100, top: 220 },
          activeTaskId: 'task-2',
          height: 100,
          sourceInsertionIndex: 1,
          sourceListId: 'target-list',
        },
        height: 100,
        listId: 'target-list',
        rects: [
          { taskId: 'task-1', top: 100, height: 100, originalIndex: 0 },
          { taskId: 'task-2', top: 220, height: 100, originalIndex: 1 },
          { taskId: 'task-3', top: 340, height: 100, originalIndex: 2 },
        ],
      }).insertionIndex
    ).toBe(1);
  });

  it('moves same-list upward once the dragged top crosses the previous card center', () => {
    const activeTask = createTask({ id: 'task-2', list_id: 'target-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 140 },
        activeTask,
        dragSession: {
          activeInitialRect: { height: 100, top: 220 },
          activeTaskId: 'task-2',
          height: 100,
          sourceInsertionIndex: 1,
          sourceListId: 'target-list',
        },
        height: 100,
        listId: 'target-list',
        rects: [
          { taskId: 'task-1', top: 100, height: 100, originalIndex: 0 },
          { taskId: 'task-2', top: 220, height: 100, originalIndex: 1 },
          { taskId: 'task-3', top: 340, height: 100, originalIndex: 2 },
        ],
      }).insertionIndex
    ).toBe(0);
  });

  it('moves same-list downward once the dragged bottom crosses the next card center', () => {
    const activeTask = createTask({ id: 'task-2', list_id: 'target-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 290 },
        activeTask,
        dragSession: {
          activeInitialRect: { height: 100, top: 220 },
          activeTaskId: 'task-2',
          height: 100,
          sourceInsertionIndex: 1,
          sourceListId: 'target-list',
        },
        height: 100,
        listId: 'target-list',
        rects: [
          { taskId: 'task-1', top: 100, height: 100, originalIndex: 0 },
          { taskId: 'task-2', top: 220, height: 100, originalIndex: 1 },
          { taskId: 'task-3', top: 340, height: 100, originalIndex: 2 },
        ],
      }).insertionIndex
    ).toBe(2);
  });

  it('supports same-list multi-card jumps from frozen task centers', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'target-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 420 },
        activeTask,
        dragSession: {
          activeInitialRect: { height: 100, top: 100 },
          activeTaskId: 'task-1',
          height: 100,
          sourceInsertionIndex: 0,
          sourceListId: 'target-list',
        },
        height: 100,
        listId: 'target-list',
        rects: [
          { taskId: 'task-1', top: 100, height: 100, originalIndex: 0 },
          { taskId: 'task-2', top: 220, height: 100, originalIndex: 1 },
          { taskId: 'task-3', top: 340, height: 100, originalIndex: 2 },
          { taskId: 'task-4', top: 460, height: 100, originalIndex: 3 },
        ],
      }).insertionIndex
    ).toBe(3);
  });

  it('projects cross-list top, middle, end, and empty-list slots', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'source-list' });
    const dragSession = {
      activeInitialRect: { height: 100, top: 0 },
      activeTaskId: 'task-1',
      height: 100,
      sourceInsertionIndex: 0,
      sourceListId: 'source-list',
    };
    const rects = [
      { taskId: 'task-2', top: 100, height: 100, originalIndex: 0 },
      { taskId: 'task-3', top: 220, height: 100, originalIndex: 1 },
      { taskId: 'task-4', top: 340, height: 100, originalIndex: 2 },
    ];

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 20 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'target-list',
        rects,
      }).insertionIndex
    ).toBe(0);
    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 90 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'target-list',
        rects,
      }).insertionIndex
    ).toBe(1);
    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 430 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'target-list',
        rects,
      }).insertionIndex
    ).toBe(3);
    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 430 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'empty-list',
        rects: [],
      }).insertionIndex
    ).toBe(0);
  });

  it('keeps preview spacer height frozen from drag start', () => {
    const activeTask = createTask({ id: 'task-1', list_id: 'source-list' });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 80, top: 90 },
        activeTask,
        dragSession: {
          activeInitialRect: { height: 144, top: 0 },
          activeTaskId: 'task-1',
          height: 144,
          sourceInsertionIndex: 0,
          sourceListId: 'source-list',
        },
        height: 144,
        listId: 'target-list',
        rects: [{ taskId: 'task-2', top: 100, height: 100, originalIndex: 0 }],
      }).height
    ).toBe(144);
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
          insertionIndex: 1,
          listId: 'target-list',
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

  it('marks optimistic previews so stale drag rollbacks can be skipped', () => {
    const queryClient = new QueryClient();
    const boardId = 'board-1';
    const activeTask = createTask({
      id: 'task-1',
      list_id: 'source-list',
      sort_key: 1_000_000,
    });
    const targetTask = createTask({
      id: 'task-2',
      list_id: 'target-list',
      sort_key: 2_000_000,
    });
    const snapshot = {
      fullTasks: [activeTask, targetTask],
      tasks: [activeTask, targetTask],
    };

    queryClient.setQueryData(['tasks', boardId], snapshot.tasks);
    queryClient.setQueryData(['tasks-full', boardId], snapshot.fullTasks);

    const preview = applyTaskDropPreviewToCache({
      activeTask,
      boardId,
      orderedTasks: [targetTask, activeTask],
      queryClient,
      snapshot,
      targetList: createList({ id: 'target-list' }),
      targetListId: 'target-list',
    });

    expect(preview?.localMutationAt).toEqual(expect.any(Number));
    expect(
      hasTaskLocalMutationAt(
        queryClient.getQueryData<Task[]>(['tasks', boardId]),
        activeTask.id,
        preview?.localMutationAt ?? -1
      )
    ).toBe(true);

    queryClient.setQueryData<Task[]>(['tasks', boardId], (currentTasks) =>
      currentTasks?.map((task) =>
        task.id === activeTask.id
          ? ({
              ...task,
              _localMutationAt: (preview?.localMutationAt ?? 0) + 1,
            } as Task & { _localMutationAt: number })
          : task
      )
    );

    expect(
      hasTaskLocalMutationAt(
        queryClient.getQueryData<Task[]>(['tasks', boardId]),
        activeTask.id,
        preview?.localMutationAt ?? -1
      )
    ).toBe(false);
  });
});
