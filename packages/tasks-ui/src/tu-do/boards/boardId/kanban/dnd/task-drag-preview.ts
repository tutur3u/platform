import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  getRectBottom,
  getRectCenterY,
  getStationaryTaskRects,
} from './task-drag-geometry';
import type {
  DragPreviewPosition,
  DragSessionMetrics,
  TaskRect,
  VerticalRect,
} from './task-drag-types';

export function dragPreviewPositionsEqual(
  current: DragPreviewPosition | null,
  next: DragPreviewPosition | null
) {
  if (current === next) return true;
  if (!current || !next) return false;

  return (
    current.listId === next.listId &&
    current.insertionIndex === next.insertionIndex &&
    current.task.id === next.task.id &&
    current.height === next.height
  );
}

export function getDragPreviewStationaryTaskCount({
  activeTaskId,
  taskIndexes,
  visibleTaskCount,
}: {
  activeTaskId: string;
  taskIndexes?: Map<string, number>;
  visibleTaskCount: number;
}) {
  return Math.max(
    0,
    (taskIndexes?.size ?? visibleTaskCount) -
      (taskIndexes?.has(activeTaskId) ? 1 : 0)
  );
}

function createDragPreviewPosition({
  activeTask,
  height,
  insertionIndex,
  listId,
  stationaryTaskCount,
}: {
  activeTask: Task;
  height: number;
  insertionIndex: number;
  listId: string;
  stationaryTaskCount: number;
}): DragPreviewPosition {
  return {
    height,
    insertionIndex: Math.max(0, Math.min(insertionIndex, stationaryTaskCount)),
    listId,
    task: activeTask,
  };
}

function getSameListInsertionIndexFromEdges({
  activeRect,
  dragSession,
  stationaryRects,
}: {
  activeRect: VerticalRect;
  dragSession: DragSessionMetrics;
  stationaryRects: TaskRect[];
}) {
  const sourceInsertionIndex = dragSession.sourceInsertionIndex;

  for (let index = 0; index < stationaryRects.length; index++) {
    const rect = stationaryRects[index];
    const originalIndex = rect?.originalIndex ?? index;

    if (!rect || originalIndex >= sourceInsertionIndex) continue;

    if (activeRect.top <= getRectCenterY(rect)) {
      return getStationaryInsertionIndex({
        fallbackIndex: index,
        rect,
        sourceInsertionIndex,
      });
    }
  }

  let insertionIndex = sourceInsertionIndex;
  const activeBottom = getRectBottom(activeRect);

  for (let index = 0; index < stationaryRects.length; index++) {
    const rect = stationaryRects[index];
    const originalIndex = rect?.originalIndex ?? index;

    if (!rect || originalIndex <= sourceInsertionIndex) continue;

    if (activeBottom >= getRectCenterY(rect)) {
      insertionIndex =
        getStationaryInsertionIndex({
          fallbackIndex: index,
          rect,
          sourceInsertionIndex,
        }) + 1;
    } else {
      break;
    }
  }

  return insertionIndex;
}

function getStationaryInsertionIndex({
  fallbackIndex,
  rect,
  sourceInsertionIndex,
}: {
  fallbackIndex: number;
  rect: TaskRect;
  sourceInsertionIndex?: number;
}) {
  const originalIndex = rect.originalIndex;
  if (
    typeof originalIndex !== 'number' ||
    !Number.isSafeInteger(originalIndex) ||
    originalIndex === Number.MAX_SAFE_INTEGER
  ) {
    return fallbackIndex;
  }

  return typeof sourceInsertionIndex === 'number' &&
    originalIndex > sourceInsertionIndex
    ? originalIndex - 1
    : originalIndex;
}

function getCrossListInsertionIndexFromEdges({
  activeRect,
  dragSession,
  stationaryRects,
}: {
  activeRect: VerticalRect;
  dragSession?: DragSessionMetrics | null;
  stationaryRects: TaskRect[];
}) {
  const initialRect = dragSession?.activeInitialRect;
  const activeBottom = getRectBottom(activeRect);

  if (initialRect && getRectCenterY(activeRect) < getRectCenterY(initialRect)) {
    for (let index = 0; index < stationaryRects.length; index++) {
      const rect = stationaryRects[index];

      if (rect && activeRect.top <= getRectCenterY(rect)) {
        return getStationaryInsertionIndex({ fallbackIndex: index, rect });
      }
    }

    const lastRect = stationaryRects[stationaryRects.length - 1];
    return lastRect
      ? getStationaryInsertionIndex({
          fallbackIndex: stationaryRects.length - 1,
          rect: lastRect,
        }) + 1
      : 0;
  }

  if (initialRect && getRectCenterY(activeRect) > getRectCenterY(initialRect)) {
    const firstRect = stationaryRects[0];
    let insertionIndex = firstRect
      ? getStationaryInsertionIndex({ fallbackIndex: 0, rect: firstRect })
      : 0;

    for (let index = 0; index < stationaryRects.length; index++) {
      const rect = stationaryRects[index];

      if (rect && activeBottom >= getRectCenterY(rect)) {
        insertionIndex =
          getStationaryInsertionIndex({ fallbackIndex: index, rect }) + 1;
      } else {
        break;
      }
    }

    return insertionIndex;
  }

  const activeCenter = getRectCenterY(activeRect);
  const insertionIndex = stationaryRects.findIndex(
    (rect) => activeCenter < getRectCenterY(rect)
  );

  if (insertionIndex !== -1) {
    const rect = stationaryRects[insertionIndex];
    return rect
      ? getStationaryInsertionIndex({ fallbackIndex: insertionIndex, rect })
      : insertionIndex;
  }

  const lastRect = stationaryRects[stationaryRects.length - 1];
  return lastRect
    ? getStationaryInsertionIndex({
        fallbackIndex: stationaryRects.length - 1,
        rect: lastRect,
      }) + 1
    : 0;
}

export function getTaskDropPreviewFromRects({
  activeRect,
  activeTask,
  dragSession,
  height,
  listId,
  rects,
  stationaryTaskCount,
}: {
  activeRect?: VerticalRect | null;
  activeTask: Task;
  dragSession?: DragSessionMetrics | null;
  height: number;
  listId: string;
  rects: TaskRect[];
  stationaryTaskCount?: number;
}): DragPreviewPosition {
  const stationaryRects = getStationaryTaskRects(rects, activeTask.id);
  const effectiveStationaryTaskCount =
    stationaryTaskCount ?? stationaryRects.length;
  const activeHeight = Math.max(1, Math.round(height));

  if (stationaryRects.length === 0 || !activeRect) {
    return createDragPreviewPosition({
      activeTask,
      height: activeHeight,
      insertionIndex: effectiveStationaryTaskCount,
      listId,
      stationaryTaskCount: effectiveStationaryTaskCount,
    });
  }

  const sameList =
    dragSession?.activeTaskId === activeTask.id &&
    dragSession.sourceListId === listId;
  const insertionIndex = sameList
    ? getSameListInsertionIndexFromEdges({
        activeRect,
        dragSession,
        stationaryRects,
      })
    : getCrossListInsertionIndexFromEdges({
        activeRect,
        dragSession,
        stationaryRects,
      });

  return createDragPreviewPosition({
    activeTask,
    height: activeHeight,
    insertionIndex,
    listId,
    stationaryTaskCount: effectiveStationaryTaskCount,
  });
}

export function getTaskDropEndPreviewFromRects({
  activeTask,
  height,
  listId,
  rects,
  stationaryTaskCount,
}: {
  activeTask: Task;
  height: number;
  listId: string;
  rects: TaskRect[];
  stationaryTaskCount?: number;
}): DragPreviewPosition {
  const stationaryRects = getStationaryTaskRects(rects, activeTask.id);

  return createDragPreviewPosition({
    activeTask,
    height,
    insertionIndex: stationaryTaskCount ?? stationaryRects.length,
    listId,
    stationaryTaskCount: stationaryTaskCount ?? stationaryRects.length,
  });
}

export function getTaskDropPreviewFromListSurface({
  activeRect,
  activeTask,
  dragSession,
  height,
  listId,
  rects,
  stationaryTaskCount,
}: {
  activeRect?: VerticalRect | null;
  activeTask: Task;
  dragSession?: DragSessionMetrics | null;
  height: number;
  listId: string;
  rects: TaskRect[];
  stationaryTaskCount?: number;
}): DragPreviewPosition {
  const stationaryRects = getStationaryTaskRects(rects, activeTask.id);
  const firstRect = stationaryRects[0];
  const lastRect = stationaryRects[stationaryRects.length - 1];

  if (!activeRect || !firstRect || !lastRect) {
    return getTaskDropEndPreviewFromRects({
      activeTask,
      height,
      listId,
      rects,
      stationaryTaskCount,
    });
  }

  const isBelowLastSlot = activeRect.top > getRectCenterY(lastRect);

  if (isBelowLastSlot) {
    const sameList =
      dragSession?.activeTaskId === activeTask.id &&
      dragSession.sourceListId === listId;
    const insertionIndex =
      getStationaryInsertionIndex({
        fallbackIndex: stationaryRects.length - 1,
        rect: lastRect,
        sourceInsertionIndex: sameList
          ? dragSession.sourceInsertionIndex
          : undefined,
      }) + 1;

    return createDragPreviewPosition({
      activeTask,
      height,
      insertionIndex,
      listId,
      stationaryTaskCount: stationaryTaskCount ?? stationaryRects.length,
    });
  }

  return getTaskDropPreviewFromRects({
    activeRect,
    activeTask,
    dragSession,
    height,
    listId,
    rects,
    stationaryTaskCount,
  });
}
