import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import {
  getDragPreviewStationaryTaskCount,
  getTaskDropPreviewFromListSurface,
  getTaskDropPreviewFromRects,
} from './task-drag-preview';
import type { DragSessionMetrics, TaskRect } from './task-drag-types';

function createTask(id: string, listId = 'list-1'): Task {
  return {
    id,
    display_number: 1,
    name: id,
    list_id: listId,
    sort_key: 1_000_000,
    created_at: '2026-05-24T00:00:00.000Z',
  } as Task;
}

function createSession(
  overrides: Partial<DragSessionMetrics> = {}
): DragSessionMetrics {
  return {
    activeInitialRect: { height: 100, top: 460 },
    activeTaskId: 'task-4',
    height: 100,
    sourceInsertionIndex: 3,
    sourceListId: 'list-1',
    ...overrides,
  };
}

const sameListRects: TaskRect[] = [
  { taskId: 'task-1', top: 100, height: 100, originalIndex: 0 },
  { taskId: 'task-2', top: 220, height: 100, originalIndex: 1 },
  { taskId: 'task-3', top: 340, height: 100, originalIndex: 2 },
  { taskId: 'task-4', top: 460, height: 100, originalIndex: 3 },
  { taskId: 'task-5', top: 580, height: 100, originalIndex: 4 },
];

describe('drag preview stationary task counts', () => {
  it('uses the full drag-start list instead of the mounted virtual window', () => {
    expect(
      getDragPreviewStationaryTaskCount({
        activeTaskId: 'external-task',
        taskIndexes: new Map(
          Array.from({ length: 100 }, (_, index) => [`task-${index}`, index])
        ),
        visibleTaskCount: 8,
      })
    ).toBe(100);
  });

  it('removes the active task from same-list stationary counts', () => {
    expect(
      getDragPreviewStationaryTaskCount({
        activeTaskId: 'task-50',
        taskIndexes: new Map(
          Array.from({ length: 100 }, (_, index) => [`task-${index}`, index])
        ),
        visibleTaskCount: 8,
      })
    ).toBe(99);
  });
});

describe('task drag preview edge threshold', () => {
  it('keeps same-list upward movement in place until the dragged top reaches the previous card center', () => {
    const activeTask = createTask('task-4');
    const dragSession = createSession();

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 391 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(3);

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 390 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(2);
  });

  it('jumps upward across every stale card whose center is crossed by the dragged top edge', () => {
    const activeTask = createTask('task-4');

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 270 },
        activeTask,
        dragSession: createSession(),
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(1);

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 149 },
        activeTask,
        dragSession: createSession(),
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(0);
  });

  it('keeps same-list downward movement in place until the dragged bottom reaches the next card center', () => {
    const activeTask = createTask('task-2');
    const dragSession = createSession({
      activeInitialRect: { height: 100, top: 220 },
      activeTaskId: 'task-2',
      sourceInsertionIndex: 1,
    });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 289 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(1);

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 290 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(2);
  });

  it('jumps downward across every stale card whose center is crossed by the dragged bottom edge', () => {
    const activeTask = createTask('task-2');
    const dragSession = createSession({
      activeInitialRect: { height: 100, top: 220 },
      activeTaskId: 'task-2',
      sourceInsertionIndex: 1,
    });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 410 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(3);

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 530 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(4);
  });

  it('uses the frozen active height for preview spacer height even when live rect height changes', () => {
    const activeTask = createTask('task-4');

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 40, top: 390 },
        activeTask,
        dragSession: createSession({ height: 132 }),
        height: 132,
        listId: 'list-1',
        rects: sameListRects,
      })
    ).toEqual(
      expect.objectContaining({
        height: 132,
        insertionIndex: 2,
      })
    );
  });

  it('keeps same-list column-surface drags above the first card eligible for the first slot', () => {
    const activeTask = createTask('task-4');

    expect(
      getTaskDropPreviewFromListSurface({
        activeRect: { height: 80, top: 0 },
        activeTask,
        dragSession: createSession(),
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(0);
  });

  it('uses insertion math for same-list column-surface gaps between cards', () => {
    const activeTask = createTask('task-4');

    expect(
      getTaskDropPreviewFromListSurface({
        activeRect: { height: 10, top: 325 },
        activeTask,
        dragSession: createSession(),
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(2);
  });

  it('uses the measured source rect for same-list movement when dnd-kit has no initial active rect', () => {
    const activeTask = createTask('task-4');
    const dragSession = createSession({ activeInitialRect: null });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 270 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(1);

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 530 },
        activeTask: createTask('task-2'),
        dragSession: createSession({
          activeInitialRect: null,
          activeTaskId: 'task-2',
          sourceInsertionIndex: 1,
        }),
        height: 100,
        listId: 'list-1',
        rects: sameListRects,
      }).insertionIndex
    ).toBe(4);
  });
});

describe('task drag preview cross-list and surface slots', () => {
  const targetRects: TaskRect[] = [
    { taskId: 'task-a', top: 100, height: 100, originalIndex: 0 },
    { taskId: 'task-b', top: 220, height: 100, originalIndex: 1 },
    { taskId: 'task-c', top: 340, height: 100, originalIndex: 2 },
  ];

  it('projects cross-list slots from active edges against target card centers', () => {
    const activeTask = createTask('task-1', 'source-list');
    const dragSession = createSession({
      activeInitialRect: { height: 100, top: 0 },
      activeTaskId: 'task-1',
      sourceInsertionIndex: 0,
      sourceListId: 'source-list',
    });

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 49 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'target-list',
        rects: targetRects,
      }).insertionIndex
    ).toBe(0);

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 50 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'target-list',
        rects: targetRects,
      }).insertionIndex
    ).toBe(1);

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 290 },
        activeTask,
        dragSession,
        height: 100,
        listId: 'target-list',
        rects: targetRects,
      }).insertionIndex
    ).toBe(3);
  });

  it('projects empty target lists to the first slot', () => {
    const activeTask = createTask('task-1', 'source-list');

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 290 },
        activeTask,
        dragSession: createSession({ activeTaskId: 'task-1' }),
        height: 100,
        listId: 'target-list',
        rects: [],
      }).insertionIndex
    ).toBe(0);
  });

  it('uses the full virtualized task count when no mounted rect can resolve a slot', () => {
    const activeTask = createTask('task-1', 'source-list');

    expect(
      getTaskDropPreviewFromRects({
        activeRect: null,
        activeTask,
        dragSession: createSession({ activeTaskId: activeTask.id }),
        height: 100,
        listId: 'target-list',
        rects: [],
        stationaryTaskCount: 100,
      }).insertionIndex
    ).toBe(100);
  });

  it('treats column-surface whitespace as an append-to-end preview', () => {
    const activeTask = createTask('task-1', 'source-list');

    expect(
      getTaskDropPreviewFromListSurface({
        activeRect: { height: 100, top: 700 },
        activeTask,
        dragSession: createSession({ activeTaskId: 'task-1' }),
        height: 100,
        listId: 'target-list',
        rects: targetRects,
      }).insertionIndex
    ).toBe(3);
  });

  it('preserves global insertion indexes when only a virtualized target window is mounted', () => {
    const activeTask = createTask('task-1', 'source-list');
    const virtualizedRects: TaskRect[] = [
      { taskId: 'task-51', top: 100, height: 100, originalIndex: 50 },
      { taskId: 'task-52', top: 220, height: 100, originalIndex: 51 },
      { taskId: 'task-53', top: 340, height: 100, originalIndex: 52 },
    ];

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 169 },
        activeTask,
        dragSession: createSession({
          activeInitialRect: { height: 100, top: 0 },
          activeTaskId: activeTask.id,
          sourceListId: 'source-list',
        }),
        height: 100,
        listId: 'target-list',
        rects: virtualizedRects,
        stationaryTaskCount: 100,
      }).insertionIndex
    ).toBe(51);
  });

  it('translates original indexes after the active task into stationary same-list indexes', () => {
    const activeTask = createTask('task-51');
    const virtualizedRects: TaskRect[] = [
      { taskId: 'task-49', top: 100, height: 100, originalIndex: 48 },
      { taskId: 'task-50', top: 220, height: 100, originalIndex: 49 },
      { taskId: 'task-51', top: 340, height: 100, originalIndex: 50 },
      { taskId: 'task-52', top: 460, height: 100, originalIndex: 51 },
      { taskId: 'task-53', top: 580, height: 100, originalIndex: 52 },
    ];

    expect(
      getTaskDropPreviewFromRects({
        activeRect: { height: 100, top: 530 },
        activeTask,
        dragSession: createSession({
          activeInitialRect: { height: 100, top: 340 },
          activeTaskId: activeTask.id,
          sourceInsertionIndex: 50,
        }),
        height: 100,
        listId: 'list-1',
        rects: virtualizedRects,
        stationaryTaskCount: 99,
      }).insertionIndex
    ).toBe(52);
  });

  it('places a surface preview after the last visible virtual card instead of at the wrong local index', () => {
    const activeTask = createTask('task-1', 'source-list');
    const virtualizedRects: TaskRect[] = [
      { taskId: 'task-51', top: 100, height: 100, originalIndex: 50 },
      { taskId: 'task-52', top: 220, height: 100, originalIndex: 51 },
      { taskId: 'task-53', top: 340, height: 100, originalIndex: 52 },
    ];

    expect(
      getTaskDropPreviewFromListSurface({
        activeRect: { height: 100, top: 500 },
        activeTask,
        dragSession: createSession({ activeTaskId: activeTask.id }),
        height: 100,
        listId: 'target-list',
        rects: virtualizedRects,
        stationaryTaskCount: 100,
      }).insertionIndex
    ).toBe(53);
  });
});
