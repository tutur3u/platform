import type {
  DragSessionMetrics,
  TaskDropPosition,
  TaskRect,
  VerticalRect,
} from './task-drag-types';

export function getRectCenterY(rect: VerticalRect) {
  return rect.top + rect.height / 2;
}

export function getRectBottom(rect: VerticalRect) {
  return rect.top + rect.height;
}

export function getStationaryTaskRects(
  rects: TaskRect[],
  activeTaskId: string
) {
  return [...rects]
    .filter((rect) => rect.taskId !== activeTaskId && rect.height > 0)
    .sort((a, b) => {
      const indexA = a.originalIndex ?? Number.MAX_SAFE_INTEGER;
      const indexB = b.originalIndex ?? Number.MAX_SAFE_INTEGER;

      if (indexA !== indexB) {
        return indexA - indexB;
      }

      return a.top - b.top;
    });
}

export function getTaskDropPositionFromRects({
  activeRect,
  overRect,
  pointerY,
}: {
  activeRect?: VerticalRect | null;
  overRect?: VerticalRect | null;
  pointerY?: number | null;
}): TaskDropPosition {
  if (!overRect) return 'before';

  if (typeof pointerY === 'number') {
    return pointerY >= overRect.top + overRect.height / 2 ? 'after' : 'before';
  }

  if (!activeRect) return 'before';

  const activeCenterY = getRectCenterY(activeRect);
  const overCenterY = getRectCenterY(overRect);

  return activeCenterY >= overCenterY ? 'after' : 'before';
}

export function getFrozenActiveRectFromDelta({
  deltaY,
  dragSession,
  fallbackRect,
  translatedRect,
}: {
  deltaY?: number | null;
  dragSession?: DragSessionMetrics | null;
  fallbackRect?: VerticalRect | null;
  translatedRect?: VerticalRect | null;
}): VerticalRect | null {
  const initialRect = dragSession?.activeInitialRect;
  const frozenHeight = Math.max(
    1,
    Math.round(dragSession?.height || initialRect?.height || 0)
  );

  if (translatedRect) {
    return {
      height: frozenHeight || Math.max(1, Math.round(translatedRect.height)),
      top: translatedRect.top,
    };
  }

  if (initialRect && typeof deltaY === 'number' && Number.isFinite(deltaY)) {
    return {
      height: frozenHeight,
      top: initialRect.top + deltaY,
    };
  }

  if (!fallbackRect) return null;

  return {
    height: Math.max(1, Math.round(fallbackRect.height)),
    top: fallbackRect.top,
  };
}
