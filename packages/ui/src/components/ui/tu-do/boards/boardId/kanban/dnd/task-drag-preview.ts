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
      return index;
    }
  }

  let insertionIndex = sourceInsertionIndex;
  const activeBottom = getRectBottom(activeRect);

  for (let index = 0; index < stationaryRects.length; index++) {
    const rect = stationaryRects[index];
    const originalIndex = rect?.originalIndex ?? index;

    if (!rect || originalIndex <= sourceInsertionIndex) continue;

    if (activeBottom >= getRectCenterY(rect)) {
      insertionIndex = index + 1;
    } else {
      break;
    }
  }

  return insertionIndex;
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
        return index;
      }
    }

    return stationaryRects.length;
  }

  if (initialRect && getRectCenterY(activeRect) > getRectCenterY(initialRect)) {
    let insertionIndex = 0;

    for (let index = 0; index < stationaryRects.length; index++) {
      const rect = stationaryRects[index];

      if (rect && activeBottom >= getRectCenterY(rect)) {
        insertionIndex = index + 1;
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

  return insertionIndex === -1 ? stationaryRects.length : insertionIndex;
}

export function getTaskDropPreviewFromRects({
  activeRect,
  activeTask,
  dragSession,
  height,
  listId,
  rects,
}: {
  activeRect?: VerticalRect | null;
  activeTask: Task;
  dragSession?: DragSessionMetrics | null;
  height: number;
  listId: string;
  rects: TaskRect[];
}): DragPreviewPosition {
  const stationaryRects = getStationaryTaskRects(rects, activeTask.id);
  const activeHeight = Math.max(1, Math.round(height));

  if (stationaryRects.length === 0 || !activeRect) {
    return createDragPreviewPosition({
      activeTask,
      height: activeHeight,
      insertionIndex: stationaryRects.length,
      listId,
      stationaryTaskCount: stationaryRects.length,
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
    stationaryTaskCount: stationaryRects.length,
  });
}

export function getTaskDropEndPreviewFromRects({
  activeTask,
  height,
  listId,
  rects,
}: {
  activeTask: Task;
  height: number;
  listId: string;
  rects: TaskRect[];
}): DragPreviewPosition {
  const stationaryRects = getStationaryTaskRects(rects, activeTask.id);

  return createDragPreviewPosition({
    activeTask,
    height,
    insertionIndex: stationaryRects.length,
    listId,
    stationaryTaskCount: stationaryRects.length,
  });
}

export function getTaskDropPreviewFromListSurface({
  activeRect,
  activeTask,
  dragSession,
  height,
  listId,
  rects,
}: {
  activeRect?: VerticalRect | null;
  activeTask: Task;
  dragSession?: DragSessionMetrics | null;
  height: number;
  listId: string;
  rects: TaskRect[];
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
    });
  }

  const isBelowLastSlot = activeRect.top > getRectCenterY(lastRect);

  if (isBelowLastSlot) {
    return getTaskDropEndPreviewFromRects({
      activeTask,
      height,
      listId,
      rects,
    });
  }

  return getTaskDropPreviewFromRects({
    activeRect,
    activeTask,
    dragSession,
    height,
    listId,
    rects,
  });
}
