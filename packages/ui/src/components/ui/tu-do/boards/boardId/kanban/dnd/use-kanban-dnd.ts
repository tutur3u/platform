'use client';

import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import {
  removeCurrentUserTaskPersonalPlacement,
  upsertCurrentUserTaskPersonalPlacement,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import {
  getPersonalExternalStagingBoardId,
  getPersonalExternalStagingListId,
  isPersonalExternalStagingListId,
} from '@tuturuuu/utils/task-helper';
import { hasDraggableData } from '@tuturuuu/utils/task-helpers';
import { useCallback, useRef, useState } from 'react';
import { useBoardBroadcast } from '../../../../shared/board-broadcast-context';
import { MAX_SAFE_INTEGER_SORT } from '../kanban-constants';
import { useAutoScroll } from './auto-scroll';
import { getColumnReorderUpdates } from './column-reorder';
import { calculateSortKeyWithRetry as createCalculateSortKeyWithRetry } from './kanban-sort-helpers';

interface UseKanbanDndProps {
  wsId?: string | null;
  boardId: string | null;
  columns: TaskList[];
  tasks: Task[];
  disableSort: boolean;
  selectedTasks: Set<string>;
  isMultiSelectMode: boolean;
  clearSelection: () => void;
  persistListPositions: (
    updates: Array<{ listId: string; newPosition: number }>
  ) => Promise<void>;
  invalidColumnMoveMessage?: string;
  invalidExternalStagingMoveMessage?: string;
  personalPlacementUpdateFailedMessage?: string;
  reorderTaskMutation: any;
  taskHeightsRef: React.RefObject<Map<string, number>>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

function usesPersonalPlacement(task: Task) {
  return (
    task.is_personal_external === true ||
    Boolean(task.personal_board_id) ||
    isPersonalExternalStagingListId(task.list_id)
  );
}

function getNeighborTaskIds(tasks: Task[], taskId: string) {
  const taskIndex = tasks.findIndex((task) => task.id === taskId);

  if (taskIndex === -1) {
    return {
      previousTaskId: null,
      nextTaskId: null,
    };
  }

  return {
    previousTaskId: tasks[taskIndex - 1]?.id ?? null,
    nextTaskId: tasks[taskIndex + 1]?.id ?? null,
  };
}

export type TaskDropPosition = 'before' | 'after';
type VerticalRect = {
  height: number;
  top: number;
};
type DragDirection = 'up' | 'down';
type TaskRect = VerticalRect & {
  taskId: string;
};
export type DragPreviewPosition = {
  listId: string;
  overTaskId: string | null;
  position: 'before' | 'after' | 'empty';
  task: Task;
  height: number;
};
type TaskInsertionPreview = DragPreviewPosition & {
  overTaskId: string;
  position: TaskDropPosition;
};
type DragCacheSnapshot = {
  tasks?: Task[];
  fullTasks?: Task[];
};
type TaskSortKeyRepair = {
  listId: string;
  sortKey: number;
  taskId: string;
};

const SORT_KEY_BASE_UNIT = 1_000_000;
const SORT_KEY_DEFAULT = SORT_KEY_BASE_UNIT * 1000;
const SORT_KEY_MIN_GAP = 1000;

function dragPreviewPositionsEqual(
  current: DragPreviewPosition | null,
  next: DragPreviewPosition | null
) {
  if (current === next) return true;
  if (!current || !next) return false;

  return (
    current.listId === next.listId &&
    current.overTaskId === next.overTaskId &&
    current.position === next.position &&
    current.task.id === next.task.id &&
    current.height === next.height
  );
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

  const activeCenterY = activeRect.top + activeRect.height / 2;
  const overCenterY = overRect.top + overRect.height / 2;

  return activeCenterY >= overCenterY ? 'after' : 'before';
}

function getTaskDropPosition(
  event: DragOverEvent | DragEndEvent,
  pointerY?: number | null
) {
  return getTaskDropPositionFromRects({
    activeRect:
      event.active.rect.current.translated ?? event.active.rect.current.initial,
    overRect: event.over?.rect,
    pointerY,
  });
}

function getActiveDragCenterY(event: DragOverEvent | DragEndEvent) {
  const activeRect =
    event.active.rect.current.translated ?? event.active.rect.current.initial;

  if (!activeRect) return null;

  return activeRect.top + activeRect.height / 2;
}

function getActiveDragTop(event: DragOverEvent | DragEndEvent) {
  const activeRect =
    event.active.rect.current.translated ?? event.active.rect.current.initial;

  return activeRect?.top ?? null;
}

function getActiveDragRect(event: DragOverEvent | DragEndEvent) {
  const activeRect =
    event.active.rect.current.translated ?? event.active.rect.current.initial;

  if (!activeRect) return null;

  return {
    height: activeRect.height,
    top: activeRect.top,
  };
}

function getEffectiveTaskDropPosition({
  droppedOnPreviewPlaceholder,
  event,
  pointerY,
  preview,
}: {
  droppedOnPreviewPlaceholder: boolean;
  event: DragOverEvent | DragEndEvent;
  pointerY?: number | null;
  preview: DragPreviewPosition | null;
}): TaskDropPosition {
  if (
    droppedOnPreviewPlaceholder &&
    (preview?.position === 'before' || preview?.position === 'after')
  ) {
    return preview.position;
  }

  return getTaskDropPosition(event, pointerY);
}

function isTaskInsertionPreview(
  preview: DragPreviewPosition | null
): preview is TaskInsertionPreview {
  return Boolean(
    preview?.overTaskId &&
      (preview.position === 'before' || preview.position === 'after')
  );
}

export function getTaskInsertionIndex({
  overTaskId,
  position,
  tasks,
}: {
  overTaskId: string;
  position: TaskDropPosition;
  tasks: Pick<Task, 'id'>[];
}) {
  const overIndex = tasks.findIndex((task) => task.id === overTaskId);
  if (overIndex === -1) return tasks.length;

  return overIndex + (position === 'after' ? 1 : 0);
}

export function insertTaskAtDropPosition({
  activeTask,
  overTaskId,
  position,
  targetListTasks,
}: {
  activeTask: Task;
  overTaskId: string;
  position: TaskDropPosition;
  targetListTasks: Task[];
}) {
  const tasksWithoutActive = targetListTasks.filter(
    (task) => task.id !== activeTask.id
  );
  const insertionIndex = getTaskInsertionIndex({
    overTaskId,
    position,
    tasks: tasksWithoutActive,
  });

  return [
    ...tasksWithoutActive.slice(0, insertionIndex),
    activeTask,
    ...tasksWithoutActive.slice(insertionIndex),
  ];
}

export function getTaskDropPreviewFromRects({
  activeCenterY,
  activeDirection,
  activeRect,
  activeTask,
  activeTop,
  height,
  initialActiveTop,
  listId,
  rects,
}: {
  activeCenterY?: number | null;
  activeDirection?: DragDirection | null;
  activeRect?: VerticalRect | null;
  activeTask: Task;
  activeTop?: number | null;
  height: number;
  initialActiveTop?: number | null;
  listId: string;
  rects: TaskRect[];
}): DragPreviewPosition {
  const effectiveActiveRect =
    activeRect ??
    (typeof activeTop === 'number' ? { height, top: activeTop } : null);
  const fallbackActiveCenterY =
    typeof effectiveActiveRect?.top === 'number'
      ? effectiveActiveRect.top + effectiveActiveRect.height / 2
      : null;
  const effectiveCenterY = activeCenterY ?? fallbackActiveCenterY;

  if (rects.length === 0 || typeof effectiveCenterY !== 'number') {
    return {
      listId,
      overTaskId: null,
      position: 'empty',
      task: activeTask,
      height,
    };
  }

  const sortedRects = [...rects].sort((a, b) => a.top - b.top);
  const nonActiveRects = sortedRects.filter(
    (rect) => rect.taskId !== activeTask.id
  );

  if (nonActiveRects.length === 0) {
    return {
      listId,
      overTaskId: null,
      position: 'empty',
      task: activeTask,
      height,
    };
  }

  if (
    effectiveActiveRect &&
    (activeDirection || typeof initialActiveTop === 'number')
  ) {
    const activeBottom = effectiveActiveRect.top + effectiveActiveRect.height;
    const fallbackDirection =
      typeof initialActiveTop !== 'number'
        ? null
        : effectiveActiveRect.top < initialActiveTop
          ? 'up'
          : effectiveActiveRect.top > initialActiveTop
            ? 'down'
            : null;
    const direction = activeDirection ?? fallbackDirection;

    if (direction === 'up') {
      for (const rect of nonActiveRects) {
        const rectCenterY = rect.top + rect.height / 2;

        if (effectiveActiveRect.top <= rectCenterY) {
          return {
            listId,
            overTaskId: rect.taskId,
            position: 'before',
            task: activeTask,
            height,
          };
        }
      }

      return {
        listId,
        overTaskId: nonActiveRects[nonActiveRects.length - 1]?.taskId ?? null,
        position: 'after',
        task: activeTask,
        height,
      };
    }

    if (direction === 'down') {
      let crossedRect: TaskRect | null = null;

      for (const rect of nonActiveRects) {
        const rectCenterY = rect.top + rect.height / 2;

        if (activeBottom >= rectCenterY) {
          crossedRect = rect;
          continue;
        }

        break;
      }

      if (crossedRect) {
        return {
          listId,
          overTaskId: crossedRect.taskId,
          position: 'after',
          task: activeTask,
          height,
        };
      }

      return {
        listId,
        overTaskId: nonActiveRects[0]?.taskId ?? null,
        position: 'before',
        task: activeTask,
        height,
      };
    }
  }

  for (const rect of nonActiveRects) {
    const rectCenterY = rect.top + rect.height / 2;

    if (effectiveCenterY < rectCenterY) {
      return {
        listId,
        overTaskId: rect.taskId,
        position: 'before',
        task: activeTask,
        height,
      };
    }
  }

  return {
    listId,
    overTaskId: nonActiveRects[nonActiveRects.length - 1]?.taskId ?? null,
    position: 'after',
    task: activeTask,
    height,
  };
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
  const nonActiveRects = [...rects]
    .filter((rect) => rect.taskId !== activeTask.id)
    .sort((a, b) => a.top - b.top);
  const lastRect = nonActiveRects[nonActiveRects.length - 1];

  if (!lastRect) {
    return {
      listId,
      overTaskId: null,
      position: 'empty',
      task: activeTask,
      height,
    };
  }

  return {
    listId,
    overTaskId: lastRect.taskId,
    position: 'after',
    task: activeTask,
    height,
  };
}

function getTaskDropPreviewFromListSurface({
  activeCenterY,
  activeDirection,
  activeRect,
  activeTask,
  activeTop,
  height,
  initialActiveTop,
  listId,
  rects,
}: {
  activeCenterY?: number | null;
  activeDirection?: DragDirection | null;
  activeRect?: VerticalRect | null;
  activeTask: Task;
  activeTop?: number | null;
  height: number;
  initialActiveTop?: number | null;
  listId: string;
  rects: TaskRect[];
}): DragPreviewPosition {
  const nonActiveRects = [...rects]
    .filter((rect) => rect.taskId !== activeTask.id)
    .sort((a, b) => a.top - b.top);
  const firstRect = nonActiveRects[0];
  const lastRect = nonActiveRects[nonActiveRects.length - 1];
  const fallbackActiveCenterY =
    typeof activeTop === 'number' ? activeTop + height / 2 : null;
  const effectiveCenterY = activeCenterY ?? fallbackActiveCenterY;

  if (!firstRect || !lastRect || typeof effectiveCenterY !== 'number') {
    return getTaskDropEndPreviewFromRects({
      activeTask,
      height,
      listId,
      rects,
    });
  }

  if (activeRect) {
    const activeBottom = activeRect.top + activeRect.height;

    if (activeBottom < firstRect.top) {
      return {
        listId,
        overTaskId: firstRect.taskId,
        position: 'before',
        task: activeTask,
        height,
      };
    }

    if (activeRect.top > lastRect.top + lastRect.height) {
      return getTaskDropEndPreviewFromRects({
        activeTask,
        height,
        listId,
        rects,
      });
    }
  } else if (
    effectiveCenterY < firstRect.top ||
    effectiveCenterY > lastRect.top + lastRect.height
  ) {
    return getTaskDropEndPreviewFromRects({
      activeTask,
      height,
      listId,
      rects,
    });
  }

  return getTaskDropPreviewFromRects({
    activeCenterY,
    activeDirection,
    activeRect,
    activeTask,
    activeTop,
    height,
    initialActiveTop,
    listId,
    rects,
  });
}

function getVisibleTaskRectsForList(listId: string) {
  if (typeof document === 'undefined') {
    return [];
  }

  const selector =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? `[data-task-card-id][data-task-list-id="${CSS.escape(listId)}"]`
      : '[data-task-card-id][data-task-list-id]';

  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter((element) => element.dataset.taskListId === listId)
    .map((element) => {
      const rect = element.getBoundingClientRect();

      return {
        taskId: element.dataset.taskCardId ?? '',
        top: rect.top,
        height: rect.height,
        width: rect.width,
      };
    })
    .filter((rect) => rect.taskId && rect.height > 0 && rect.width > 0)
    .sort((a, b) => a.top - b.top);
}

function sortTasksForList({
  disableSort,
  targetList,
  tasks,
}: {
  disableSort: boolean;
  targetList: TaskList | undefined;
  tasks: Task[];
}) {
  return [...tasks].sort((a, b) => {
    if (targetList?.status === 'done') {
      const completionA = a.completed_at
        ? new Date(a.completed_at).getTime()
        : 0;
      const completionB = b.completed_at
        ? new Date(b.completed_at).getTime()
        : 0;
      return completionB - completionA;
    }

    if (targetList?.status === 'closed') {
      const closedA = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const closedB = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      return closedB - closedA;
    }

    if (!disableSort) {
      const sortA = a.sort_key ?? MAX_SAFE_INTEGER_SORT;
      const sortB = b.sort_key ?? MAX_SAFE_INTEGER_SORT;
      if (sortA !== sortB) return sortA - sortB;
      if (!a.created_at || !b.created_at) return 0;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return 0;
  });
}

function getProjectedTaskDropOrder({
  activeTask,
  droppedOnPreviewPlaceholder,
  event,
  isCompletionList,
  latestDragPreviewPosition,
  overId,
  overType,
  pointerY,
  targetListTasks,
  taskInsertionPreview,
}: {
  activeTask: Task;
  droppedOnPreviewPlaceholder: boolean;
  event: DragOverEvent | DragEndEvent;
  isCompletionList: boolean;
  latestDragPreviewPosition: DragPreviewPosition | null;
  overId: string;
  overType: unknown;
  pointerY?: number | null;
  targetListTasks: Task[];
  taskInsertionPreview: TaskInsertionPreview | null;
}) {
  const targetListTasksWithoutActive = targetListTasks.filter(
    (task) => task.id !== activeTask.id
  );

  if (isCompletionList || overType === 'Column') {
    return [activeTask, ...targetListTasksWithoutActive];
  }

  const effectiveOverTaskId =
    taskInsertionPreview?.overTaskId ??
    (droppedOnPreviewPlaceholder && latestDragPreviewPosition?.overTaskId
      ? latestDragPreviewPosition.overTaskId
      : overId);

  const taskDropPosition =
    taskInsertionPreview?.position ??
    getEffectiveTaskDropPosition({
      droppedOnPreviewPlaceholder,
      event,
      pointerY,
      preview: taskInsertionPreview ?? latestDragPreviewPosition,
    });

  const overIndex = targetListTasksWithoutActive.findIndex(
    (task) => task.id === effectiveOverTaskId
  );

  if (overIndex === -1) {
    return [...targetListTasksWithoutActive, activeTask];
  }

  return insertTaskAtDropPosition({
    activeTask,
    overTaskId: effectiveOverTaskId,
    position: taskDropPosition,
    targetListTasks,
  });
}

export function getProjectedTaskDropOrderFromPreview({
  activeTask,
  isCompletionList,
  preview,
  targetListTasks,
}: {
  activeTask: Task;
  isCompletionList: boolean;
  preview: DragPreviewPosition | null;
  targetListTasks: Task[];
}) {
  const targetListTasksWithoutActive = targetListTasks.filter(
    (task) => task.id !== activeTask.id
  );

  if (isCompletionList) {
    return [activeTask, ...targetListTasksWithoutActive];
  }

  if (!preview || preview.position === 'empty') {
    return [...targetListTasksWithoutActive, activeTask];
  }

  if (preview.position === 'before' && preview.overTaskId === null) {
    return [activeTask, ...targetListTasksWithoutActive];
  }

  if (isTaskInsertionPreview(preview)) {
    return insertTaskAtDropPosition({
      activeTask,
      overTaskId: preview.overTaskId,
      position: preview.position,
      targetListTasks,
    });
  }

  return [...targetListTasksWithoutActive, activeTask];
}

function getTaskSortKeyInsertionContext({
  activeTaskId,
  orderedTasks,
}: {
  activeTaskId: string;
  orderedTasks: Pick<Task, 'id' | 'sort_key'>[];
}) {
  const activeIndex = orderedTasks.findIndex(
    (task) => task.id === activeTaskId
  );
  if (activeIndex === -1) {
    return {
      activeIndex,
      nextSortKey: null,
      previousSortKey: null,
    };
  }

  return {
    activeIndex,
    nextSortKey: orderedTasks[activeIndex + 1]?.sort_key ?? null,
    previousSortKey: orderedTasks[activeIndex - 1]?.sort_key ?? null,
  };
}

function hasRepresentableSortKeyGap(
  previousSortKey: number | null,
  nextSortKey: number | null
) {
  if (previousSortKey === null) {
    return nextSortKey === null || nextSortKey >= SORT_KEY_MIN_GAP;
  }

  if (nextSortKey === null) {
    return true;
  }

  return nextSortKey - previousSortKey >= SORT_KEY_MIN_GAP;
}

function getRepairedSortKeyForIndex(index: number) {
  return (index + 1) * SORT_KEY_BASE_UNIT;
}

function getDeterministicPreviewSortKey({
  nextSortKey,
  previousSortKey,
}: {
  nextSortKey: number | null;
  previousSortKey: number | null;
}) {
  if (previousSortKey === null) {
    if (nextSortKey === null) return SORT_KEY_DEFAULT;
    if (nextSortKey <= 1) return SORT_KEY_DEFAULT;

    const halfNext = Math.floor(nextSortKey / 2);

    if (nextSortKey <= SORT_KEY_MIN_GAP) {
      return Math.max(1, Math.min(halfNext, nextSortKey - 1));
    }

    return Math.max(
      halfNext,
      Math.min(SORT_KEY_BASE_UNIT, nextSortKey - SORT_KEY_MIN_GAP)
    );
  }

  if (nextSortKey === null) {
    return previousSortKey + SORT_KEY_BASE_UNIT;
  }

  const gap = nextSortKey - previousSortKey;

  if (gap <= 1) {
    return previousSortKey + SORT_KEY_BASE_UNIT;
  }

  return Math.floor((previousSortKey + nextSortKey) / 2);
}

function getPreviewSortKeyPlan({
  activeTaskId,
  orderedTasks,
  targetListId,
}: {
  activeTaskId: string;
  orderedTasks: Pick<Task, 'id' | 'sort_key'>[];
  targetListId: string;
}): {
  previewSortKey: number;
  repairedTaskSortKeys: TaskSortKeyRepair[];
} {
  const { activeIndex, nextSortKey, previousSortKey } =
    getTaskSortKeyInsertionContext({
      activeTaskId,
      orderedTasks,
    });

  if (activeIndex === -1) {
    return {
      previewSortKey: MAX_SAFE_INTEGER_SORT,
      repairedTaskSortKeys: [],
    };
  }

  const previewSortKey = getDeterministicPreviewSortKey({
    nextSortKey,
    previousSortKey,
  });
  const effectiveOrderedTasks = orderedTasks.map((task) => ({
    ...task,
    sort_key: task.id === activeTaskId ? previewSortKey : task.sort_key,
  }));
  const orderNeedsRepair = effectiveOrderedTasks.some((task, index) => {
    if (typeof task.sort_key !== 'number' || !Number.isFinite(task.sort_key)) {
      return true;
    }

    const previousTask = effectiveOrderedTasks[index - 1];
    if (!previousTask) return false;

    if (
      typeof previousTask.sort_key !== 'number' ||
      !Number.isFinite(previousTask.sort_key)
    ) {
      return true;
    }

    return task.sort_key - previousTask.sort_key < SORT_KEY_MIN_GAP;
  });

  if (
    !hasRepresentableSortKeyGap(previousSortKey, nextSortKey) ||
    orderNeedsRepair
  ) {
    return {
      previewSortKey: getRepairedSortKeyForIndex(activeIndex),
      repairedTaskSortKeys: orderedTasks.map((task, index) => ({
        listId: targetListId,
        sortKey: getRepairedSortKeyForIndex(index),
        taskId: task.id,
      })),
    };
  }

  return {
    previewSortKey,
    repairedTaskSortKeys: [],
  };
}

export function getTaskDropPreviewCacheTasks({
  activeTask,
  localMutationAt = Date.now(),
  orderedTasks,
  tasks,
  targetList,
  targetListId,
}: {
  activeTask: Task;
  localMutationAt?: number;
  orderedTasks: Task[];
  tasks: Task[] | undefined;
  targetList: TaskList | undefined;
  targetListId: string;
}) {
  if (!tasks) return { previewSortKey: null, tasks };

  const { previewSortKey, repairedTaskSortKeys } = getPreviewSortKeyPlan({
    activeTaskId: activeTask.id,
    orderedTasks,
    targetListId,
  });
  const repairedSortKeysByTaskId = new Map(
    repairedTaskSortKeys.map((repair) => [repair.taskId, repair.sortKey])
  );
  const mutationTimestamp = new Date(localMutationAt).toISOString();
  const targetIsCompleted = targetList?.status === 'done';
  const targetIsTerminal = targetList?.status === 'closed';

  return {
    previewSortKey,
    repairedTaskSortKeys,
    tasks: tasks.map((task) =>
      task.id === activeTask.id
        ? ({
            ...task,
            list_id: targetListId,
            sort_key: previewSortKey,
            completed: targetIsCompleted,
            completed_at: targetIsCompleted
              ? (task.completed_at ?? mutationTimestamp)
              : null,
            closed_at: targetIsTerminal
              ? (task.closed_at ?? mutationTimestamp)
              : null,
            _localMutationAt: localMutationAt,
          } as Task & { _localMutationAt: number })
        : repairedSortKeysByTaskId.has(task.id)
          ? ({
              ...task,
              sort_key: repairedSortKeysByTaskId.get(task.id) ?? task.sort_key,
              _localMutationAt: localMutationAt,
            } as Task & { _localMutationAt: number })
          : task
    ),
  };
}

function applyTaskDropPreviewToCache({
  activeTask,
  boardId,
  orderedTasks,
  queryClient,
  snapshot,
  targetList,
  targetListId,
}: {
  activeTask: Task;
  boardId: string | null;
  orderedTasks: Task[];
  queryClient: QueryClient;
  snapshot: DragCacheSnapshot;
  targetList: TaskList | undefined;
  targetListId: string;
}) {
  if (!boardId) return null;

  const localMutationAt = Date.now();
  const previewTasks = getTaskDropPreviewCacheTasks({
    activeTask,
    localMutationAt,
    orderedTasks,
    tasks: snapshot.tasks,
    targetList,
    targetListId,
  });
  const previewFullTasks = getTaskDropPreviewCacheTasks({
    activeTask,
    localMutationAt,
    orderedTasks,
    tasks: snapshot.fullTasks,
    targetList,
    targetListId,
  });

  if (previewTasks.tasks) {
    queryClient.setQueryData(['tasks', boardId], previewTasks.tasks);
  }

  if (previewFullTasks.tasks) {
    queryClient.setQueryData(['tasks-full', boardId], previewFullTasks.tasks);
  }

  return {
    previousFullTasks: snapshot.fullTasks,
    previousTasks: snapshot.tasks,
    previewSortKey: previewTasks.previewSortKey,
    repairedTaskSortKeys: previewTasks.repairedTaskSortKeys,
  };
}

export function mergeTaskIntoBoardTaskCache(
  currentTasks: Task[] | undefined,
  nextTask: Task
) {
  const existingTasks = currentTasks ?? [];
  let found = false;

  const mergedTasks = existingTasks.map((task) => {
    if (task.id !== nextTask.id) return task;
    found = true;
    return { ...task, ...nextTask } as Task;
  });

  return found ? mergedTasks : [...mergedTasks, nextTask];
}

function setBoardTaskCache(
  queryClient: QueryClient,
  boardId: string,
  nextTask: Task
) {
  queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) =>
    mergeTaskIntoBoardTaskCache(old, nextTask)
  );

  if (queryClient.getQueryData<Task[]>(['tasks-full', boardId])) {
    queryClient.setQueryData(
      ['tasks-full', boardId],
      (old: Task[] | undefined) => mergeTaskIntoBoardTaskCache(old, nextTask)
    );
  }
}

export function mergePersonalPlacementMutationTask(
  task: Task,
  nextTask: Task & { _localMutationAt: number },
  responseTask: Task | undefined,
  isStagingTarget: boolean
) {
  return {
    ...nextTask,
    ...(responseTask ?? {}),
    assignees: task.assignees,
    labels: task.labels,
    projects: task.projects,
    list_id: responseTask?.list_id ?? nextTask.list_id,
    sort_key: responseTask?.sort_key ?? nextTask.sort_key,
    personal_sort_key:
      responseTask?.personal_sort_key ?? nextTask.personal_sort_key,
    is_personal_external_default: isStagingTarget,
    _localMutationAt: nextTask._localMutationAt,
  } as Task & { _localMutationAt: number };
}

export function useKanbanDnd({
  wsId,
  boardId,
  columns,
  tasks,
  disableSort,
  selectedTasks,
  isMultiSelectMode,
  clearSelection,
  persistListPositions,
  invalidColumnMoveMessage,
  invalidExternalStagingMoveMessage,
  personalPlacementUpdateFailedMessage,
  reorderTaskMutation,
  taskHeightsRef,
  scrollContainerRef,
}: UseKanbanDndProps) {
  const broadcast = useBoardBroadcast();
  const [activeColumn, setActiveColumn] = useState<TaskList | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [hoverTargetListId, setHoverTargetListId] = useState<string | null>(
    null
  );
  const [dragPreviewPosition, setDragPreviewPositionState] =
    useState<DragPreviewPosition | null>(null);
  const [optimisticUpdateInProgress, setOptimisticUpdateInProgress] = useState<
    Set<string>
  >(new Set());

  // Refs for drag state
  const pickedUpTaskColumn = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const lastTargetListIdRef = useRef<string | null>(null);
  const dragPreviewPositionRef = useRef<DragPreviewPosition | null>(null);
  const dragStartCacheRef = useRef<DragCacheSnapshot | null>(null);
  const taskRectsCacheRef = useRef<Map<string, TaskRect[]>>(new Map());
  const activeInitialTopRef = useRef<number | null>(null);
  const lastActiveTopRef = useRef<number | null>(null);
  const lastDragDirectionRef = useRef<DragDirection | null>(null);

  const setDragPreviewPosition = useCallback(
    (position: DragPreviewPosition | null) => {
      if (dragPreviewPositionsEqual(dragPreviewPositionRef.current, position)) {
        return;
      }

      dragPreviewPositionRef.current = position;
      setDragPreviewPositionState(position);
    },
    []
  );

  const queryClient = useQueryClient();
  const getCachedVisibleTaskRects = useCallback((listId: string) => {
    const cached = taskRectsCacheRef.current.get(listId);
    if (cached) return cached;

    const rects = getVisibleTaskRectsForList(listId);
    taskRectsCacheRef.current.set(listId, rects);

    return rects;
  }, []);

  const restoreDragStartCache = useCallback(() => {
    if (!boardId || !dragStartCacheRef.current) return;

    if (dragStartCacheRef.current.tasks) {
      queryClient.setQueryData(
        ['tasks', boardId],
        dragStartCacheRef.current.tasks
      );
    }

    if (dragStartCacheRef.current.fullTasks) {
      queryClient.setQueryData(
        ['tasks-full', boardId],
        dragStartCacheRef.current.fullTasks
      );
    }
  }, [boardId, queryClient]);

  const movePersonalPlacementTask = useCallback(
    async (
      task: Task,
      targetListId: string,
      newSortKey: number | null,
      order?: {
        previousTaskId?: string | null;
        nextTaskId?: string | null;
      }
    ): Promise<Task> => {
      if (!boardId) {
        throw new Error('Board ID is required');
      }

      const stagingBoardId = getPersonalExternalStagingBoardId(targetListId);
      const targetBoardId = stagingBoardId ?? boardId;
      const isStagingTarget = stagingBoardId !== null;
      const nextTask = {
        ...task,
        list_id: isStagingTarget
          ? getPersonalExternalStagingListId(targetBoardId)
          : targetListId,
        sort_key: isStagingTarget ? null : newSortKey,
        personal_board_id: targetBoardId,
        personal_list_id: isStagingTarget ? null : targetListId,
        personal_sort_key: isStagingTarget ? null : newSortKey,
        personal_placed_at: isStagingTarget ? null : new Date().toISOString(),
        is_personal_external: true,
        is_personal_external_default: isStagingTarget,
        _localMutationAt: Date.now(),
      } as Task & { _localMutationAt: number };

      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);
      const previousFullTasks = queryClient.getQueryData<Task[]>([
        'tasks-full',
        boardId,
      ]);

      setBoardTaskCache(queryClient, boardId, nextTask);

      setOptimisticUpdateInProgress((prev) => new Set(prev).add(task.id));

      try {
        const response = isStagingTarget
          ? null
          : await upsertCurrentUserTaskPersonalPlacement(task.id, {
              personal_board_id: targetBoardId,
              personal_list_id: targetListId,
              personal_sort_key: newSortKey,
              previous_task_id: order?.previousTaskId ?? null,
              next_task_id: order?.nextTaskId ?? null,
            });

        if (isStagingTarget) {
          await removeCurrentUserTaskPersonalPlacement(task.id);
        }

        const savedTask = mergePersonalPlacementMutationTask(
          task,
          nextTask,
          response?.task,
          isStagingTarget
        );

        setBoardTaskCache(queryClient, boardId, savedTask);

        return savedTask;
      } catch (error) {
        if (previousTasks) {
          queryClient.setQueryData(['tasks', boardId], previousTasks);
        }
        if (previousFullTasks) {
          queryClient.setQueryData(['tasks-full', boardId], previousFullTasks);
        }
        throw error;
      } finally {
        setOptimisticUpdateInProgress((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    },
    [boardId, queryClient]
  );

  // Use the extracted calculateSortKeyWithRetry helper
  const calculateSortKeyWithRetry = useCallback(
    (
      prevSortKey: number | null | undefined,
      nextSortKey: number | null | undefined,
      listId: string,
      visualOrderTasks?: Pick<Task, 'id' | 'sort_key' | 'created_at'>[]
    ) => {
      if (!wsId) {
        return Promise.reject(new Error('Workspace ID is required'));
      }

      return createCalculateSortKeyWithRetry(
        wsId,
        prevSortKey,
        nextSortKey,
        listId,
        visualOrderTasks
      );
    },
    [wsId]
  );

  // Initialize auto-scroll
  useAutoScroll(isDraggingRef, scrollContainerRef);

  const resetDragState = useCallback(
    (clearOptimisticUpdates = false) => {
      setActiveColumn(null);
      setActiveTask(null);
      setHoverTargetListId(null);
      setDragPreviewPosition(null);
      pickedUpTaskColumn.current = null;
      lastTargetListIdRef.current = null;
      dragStartCacheRef.current = null;
      taskRectsCacheRef.current.clear();
      activeInitialTopRef.current = null;
      lastActiveTopRef.current = null;
      lastDragDirectionRef.current = null;
      isDraggingRef.current = false;

      if (clearOptimisticUpdates) {
        setOptimisticUpdateInProgress(new Set());
      }
    },
    [setDragPreviewPosition]
  );

  const processDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) {
        if (lastTargetListIdRef.current) {
          lastTargetListIdRef.current = null;
          setHoverTargetListId(null);
          setDragPreviewPosition(null);
        }
        return;
      }

      const activeType = active.data?.current?.type;
      if (!activeType) return;

      if (activeType === 'Task') {
        if (!wsId) {
          setHoverTargetListId(null);
          setDragPreviewPosition(null);
          return;
        }

        const activeTask = active.data?.current?.task;
        if (!activeTask) return;

        let targetListId: string;
        const overType = over.data?.current?.type;
        let nextPreviewPosition: DragPreviewPosition | null = null;
        const activeTop = getActiveDragTop(event);
        const activeCenterY = getActiveDragCenterY(event);
        const activeRect = getActiveDragRect(event);
        const previousActiveTop = lastActiveTopRef.current;
        let activeDirection = lastDragDirectionRef.current;

        if (
          typeof activeTop === 'number' &&
          typeof previousActiveTop === 'number'
        ) {
          const topDelta = activeTop - previousActiveTop;

          if (Math.abs(topDelta) >= 1) {
            activeDirection = topDelta < 0 ? 'up' : 'down';
            lastDragDirectionRef.current = activeDirection;
          }
        }

        if (typeof activeTop === 'number') {
          lastActiveTopRef.current = activeTop;
        }

        // Get cached height for the dragged task, fallback to 96px
        const cachedHeight = taskHeightsRef.current.get(activeTask.id) || 96;

        if (overType === 'Column') {
          targetListId = String(over.id);
          // Dropping on column header - preview at beginning
          nextPreviewPosition = {
            listId: targetListId,
            overTaskId: null,
            position: 'before',
            task: activeTask,
            height: cachedHeight,
          };
          setDragPreviewPosition(nextPreviewPosition);
        } else if (overType === 'Task') {
          if (String(over.id) === String(active.id)) {
            const overTask = over.data?.current?.task as Task | undefined;
            const currentPreview = dragPreviewPositionRef.current;
            targetListId = String(
              overTask?.list_id ?? currentPreview?.listId ?? activeTask.list_id
            );
            const visibleTaskRects = getCachedVisibleTaskRects(targetListId);
            nextPreviewPosition = getTaskDropPreviewFromRects({
              activeTask,
              activeDirection,
              activeRect,
              activeTop,
              activeCenterY,
              height: cachedHeight,
              initialActiveTop: activeInitialTopRef.current,
              listId: targetListId,
              rects: visibleTaskRects,
            });
            setDragPreviewPosition(nextPreviewPosition);
          } else {
            const overTask = over.data?.current?.task as Task | undefined;
            if (!overTask) return;
            targetListId = String(overTask.list_id);
            const visibleTaskRects = getCachedVisibleTaskRects(targetListId);
            nextPreviewPosition = getTaskDropPreviewFromRects({
              activeTask,
              activeDirection,
              activeRect,
              activeTop,
              activeCenterY,
              height: cachedHeight,
              initialActiveTop: activeInitialTopRef.current,
              listId: targetListId,
              rects: visibleTaskRects,
            });
            setDragPreviewPosition(nextPreviewPosition);
          }
        } else if (overType === 'ColumnSurface') {
          const columnId = over.data?.current?.columnId || over.id;
          if (!columnId) return;
          targetListId = String(columnId);
          const visibleTaskRects = getCachedVisibleTaskRects(targetListId);
          nextPreviewPosition = getTaskDropPreviewFromListSurface({
            activeCenterY,
            activeDirection,
            activeRect,
            activeTask,
            activeTop,
            height: cachedHeight,
            initialActiveTop: activeInitialTopRef.current,
            listId: targetListId,
            rects: visibleTaskRects,
          });
          setDragPreviewPosition(nextPreviewPosition);
        } else {
          return;
        }

        const originalListId = pickedUpTaskColumn.current;
        if (!originalListId) return;

        const sourceListExists = columns.some(
          (col) => String(col.id) === originalListId
        );
        const targetListExists = columns.some(
          (col) => String(col.id) === targetListId
        );

        if (!sourceListExists || !targetListExists) return;

        // Skip if target list unchanged for current drag set to avoid redundant cache writes
        if (lastTargetListIdRef.current === targetListId) {
          return;
        }
        lastTargetListIdRef.current = targetListId;
        setHoverTargetListId((current) =>
          current === targetListId ? current : targetListId
        );
      }
    },
    [
      columns,
      getCachedVisibleTaskRects,
      setDragPreviewPosition,
      taskHeightsRef,
      wsId,
    ]
  );

  // Capture drag start card left position
  function onDragStart(event: DragStartEvent) {
    if (!hasDraggableData(event.active)) return;
    const { active } = event;
    if (!active.data?.current) return;

    // Enable auto-scroll
    isDraggingRef.current = true;

    const { type } = active.data.current;
    if (type === 'Column') {
      setActiveColumn(active.data.current.column);
      return;
    }
    if (type === 'Task') {
      if (!wsId) {
        return;
      }

      const task = active.data.current.task;

      if (boardId) {
        dragStartCacheRef.current = {
          tasks: queryClient.getQueryData<Task[]>(['tasks', boardId]),
          fullTasks: queryClient.getQueryData<Task[]>(['tasks-full', boardId]),
        };
      } else {
        dragStartCacheRef.current = null;
      }
      taskRectsCacheRef.current.clear();
      activeInitialTopRef.current =
        event.active.rect.current.initial?.top ?? null;
      lastActiveTopRef.current = activeInitialTopRef.current;
      lastDragDirectionRef.current = null;

      // If this is a multi-select drag, include all selected tasks
      if (isMultiSelectMode && selectedTasks.has(task.id)) {
        setActiveTask(task); // Set the dragged task as active for overlay
      } else {
        setActiveTask(task);
      }

      pickedUpTaskColumn.current = String(task.list_id);
      lastTargetListIdRef.current = String(task.list_id);
      setHoverTargetListId(String(task.list_id));
      return;
    }
  }

  function onDragOver(event: DragOverEvent) {
    processDragOver(event);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    // Store the original list ID before resetting drag state
    const originalListId = pickedUpTaskColumn.current;
    const activeType = active.data?.current?.type;

    if (!over) {
      // Reset drag state only on invalid drop
      if (activeType === 'Task') {
        restoreDragStartCache();
      }
      resetDragState(true);
      return;
    }

    if (!activeType) {
      resetDragState(true);
      return;
    }

    if (activeType === 'Task' && !wsId) {
      restoreDragStartCache();
      resetDragState(true);
      return;
    }

    // Handle column reordering
    if (activeType === 'Column') {
      const activeColumn = active.data?.current?.column;
      const overColumn = over.data?.current?.column;

      if (activeColumn && overColumn && activeColumn.id !== overColumn.id) {
        if (
          activeColumn.is_external_staging ||
          overColumn.is_external_staging
        ) {
          resetDragState(true);
          return;
        }

        if (activeColumn.status !== overColumn.status) {
          toast.warning(
            invalidColumnMoveMessage ??
              'Task lists can only be reordered within the same status group'
          );
        }

        const updates = getColumnReorderUpdates(
          columns,
          String(activeColumn.id),
          String(overColumn.id)
        );

        if (updates) {
          const previousLists = queryClient.getQueryData<TaskList[]>([
            'task_lists',
            boardId,
          ]);

          queryClient.setQueryData(
            ['task_lists', boardId],
            (oldData: TaskList[] | undefined) => {
              if (!oldData) return oldData;
              return oldData.map((list) => {
                const update = updates.find((item) => item.listId === list.id);
                return update
                  ? { ...list, position: update.newPosition }
                  : list;
              });
            }
          );

          try {
            await persistListPositions(updates);
          } catch (error) {
            console.error('Failed to reorder list:', error);
            toast.error('Failed to reorder list');

            if (previousLists) {
              queryClient.setQueryData(['task_lists', boardId], previousLists);
            } else {
              queryClient.invalidateQueries({
                queryKey: ['task_lists', boardId],
              });
            }
          }
        }
      }
      setActiveColumn(null);
      setActiveTask(null);
      setHoverTargetListId(null);
      setDragPreviewPosition(null);
      pickedUpTaskColumn.current = null;
      lastTargetListIdRef.current = null;
      setOptimisticUpdateInProgress(new Set());
      return;
    }

    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      const resetTaskDragAfterInvalidDrop = () => {
        restoreDragStartCache();
        resetDragState(true);
      };

      if (!activeTask) {
        resetTaskDragAfterInvalidDrop();
        return;
      }

      const dragStartSnapshot = dragStartCacheRef.current ?? {
        tasks: boardId
          ? queryClient.getQueryData<Task[]>(['tasks', boardId])
          : undefined,
        fullTasks: boardId
          ? queryClient.getQueryData<Task[]>(['tasks-full', boardId])
          : undefined,
      };
      const baseTasks = dragStartSnapshot.tasks ?? tasks;
      const activeTaskForDrop =
        baseTasks.find((task) => task.id === activeTask.id) ?? activeTask;

      let targetListId: string;
      const overType = over.data?.current?.type;
      const latestDragPreviewPosition = dragPreviewPositionRef.current;
      const latestPreviewForActive =
        latestDragPreviewPosition?.task.id === activeTask.id
          ? latestDragPreviewPosition
          : null;
      const droppedOnPreviewPlaceholder =
        overType === 'Task' && String(over.id) === String(active.id);

      if (latestPreviewForActive) {
        targetListId = latestPreviewForActive.listId;
      } else if (overType === 'Column') {
        targetListId = String(over.id);
      } else if (overType === 'Task') {
        if (droppedOnPreviewPlaceholder && latestDragPreviewPosition) {
          targetListId = latestDragPreviewPosition.listId;
        } else if (droppedOnPreviewPlaceholder) {
          resetTaskDragAfterInvalidDrop();
          return;
        } else {
          // When dropping on a task, use the list_id of the target task
          const targetTask = over.data?.current?.task;
          if (!targetTask) {
            resetTaskDragAfterInvalidDrop();
            return;
          }
          targetListId = String(targetTask.list_id);
        }
      } else if (overType === 'ColumnSurface') {
        const columnId = over.data?.current?.columnId || over.id;
        if (!columnId) {
          resetTaskDragAfterInvalidDrop();
          return;
        }
        targetListId = String(columnId);
      } else {
        resetTaskDragAfterInvalidDrop();
        return;
      }

      if (!originalListId) {
        resetTaskDragAfterInvalidDrop();
        return;
      }

      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );

      if (!sourceListExists || !targetListExists) {
        resetTaskDragAfterInvalidDrop();
        return;
      }
      const taskInsertionPreview =
        latestPreviewForActive?.listId === targetListId &&
        isTaskInsertionPreview(latestPreviewForActive)
          ? latestPreviewForActive
          : null;

      // Calculate target position based on drop location
      // Get all tasks in the target list (INCLUDE the dragged task if it's in the same list)
      let targetListTasks = baseTasks.filter((t) => t.list_id === targetListId);

      // Find the target list to check its status
      const targetList = columns.find((col) => String(col.id) === targetListId);
      const targetIsExternalStaging =
        isPersonalExternalStagingListId(targetListId) ||
        targetList?.is_external_staging === true;
      const activeUsesPersonalPlacement =
        usesPersonalPlacement(activeTaskForDrop);

      if (targetIsExternalStaging && !activeUsesPersonalPlacement) {
        toast.warning(
          invalidExternalStagingMoveMessage ??
            'Only external tasks can use the staging lane'
        );
        resetTaskDragAfterInvalidDrop();
        return;
      }

      // IMPORTANT: For "done" and "closed" lists, always place at first position (top)
      const isCompletionList =
        targetList?.status === 'done' || targetList?.status === 'closed';

      // Sort tasks from the drag-start snapshot so release persists exactly
      // the same order shown in the live preview.
      targetListTasks = sortTasksForList({
        disableSort,
        targetList,
        tasks: targetListTasks,
      });

      const isBulkTaskDrag = isMultiSelectMode && selectedTasks.size > 1;
      const projectedDropOrder =
        latestPreviewForActive && !isBulkTaskDrag
          ? getProjectedTaskDropOrderFromPreview({
              activeTask: activeTaskForDrop,
              isCompletionList,
              preview: latestPreviewForActive,
              targetListTasks,
            })
          : getProjectedTaskDropOrder({
              activeTask: activeTaskForDrop,
              droppedOnPreviewPlaceholder,
              event,
              isCompletionList,
              latestDragPreviewPosition,
              overId: String(over.id),
              overType,
              targetListTasks,
              taskInsertionPreview,
            });
      const currentTaskIndex = targetListTasks.findIndex(
        (task) => task.id === activeTask.id
      );
      const projectedTaskIndex = projectedDropOrder.findIndex(
        (task) => task.id === activeTaskForDrop.id
      );
      const dropChangesVisualOrder =
        targetListId !== originalListId ||
        (currentTaskIndex !== -1 && currentTaskIndex !== projectedTaskIndex);
      const optimisticDropPreview =
        dropChangesVisualOrder && !isBulkTaskDrag
          ? applyTaskDropPreviewToCache({
              activeTask: activeTaskForDrop,
              boardId,
              orderedTasks: projectedDropOrder,
              queryClient,
              snapshot: dragStartSnapshot,
              targetList,
              targetListId,
            })
          : null;

      const rollbackOptimisticDropPreview = () => {
        if (!boardId || !optimisticDropPreview) return;

        if (optimisticDropPreview.previousTasks) {
          queryClient.setQueryData(
            ['tasks', boardId],
            optimisticDropPreview.previousTasks
          );
        }

        if (optimisticDropPreview.previousFullTasks) {
          queryClient.setQueryData(
            ['tasks-full', boardId],
            optimisticDropPreview.previousFullTasks
          );
        }
      };

      let newSortKey: number | null;
      let personalPlacementOrder:
        | {
            previousTaskId: string | null;
            nextTaskId: string | null;
          }
        | undefined;
      personalPlacementOrder = getNeighborTaskIds(
        projectedDropOrder,
        activeTaskForDrop.id
      );

      if (targetIsExternalStaging) {
        newSortKey = null;
      } else if (typeof optimisticDropPreview?.previewSortKey === 'number') {
        newSortKey = optimisticDropPreview.previewSortKey;
      } else {
        const newIndex = projectedTaskIndex;

        try {
          if (projectedDropOrder.length === 1) {
            newSortKey = await calculateSortKeyWithRetry(
              null,
              null,
              targetListId,
              projectedDropOrder
            );
          } else if (newIndex === 0) {
            const nextTask = projectedDropOrder[1];
            newSortKey = await calculateSortKeyWithRetry(
              null,
              nextTask?.sort_key ?? null,
              targetListId,
              projectedDropOrder
            );
          } else if (newIndex === projectedDropOrder.length - 1) {
            const prevTask = projectedDropOrder[projectedDropOrder.length - 2];
            newSortKey = await calculateSortKeyWithRetry(
              prevTask?.sort_key ?? null,
              null,
              targetListId,
              projectedDropOrder
            );
          } else {
            const prevTask = projectedDropOrder[newIndex - 1];
            const nextTask = projectedDropOrder[newIndex + 1];
            newSortKey = await calculateSortKeyWithRetry(
              prevTask?.sort_key ?? null,
              nextTask?.sort_key ?? null,
              targetListId,
              projectedDropOrder
            );
          }
        } catch (error) {
          console.error('Failed to calculate sort key:', error);
          rollbackOptimisticDropPreview();
          resetDragState(true);
          return;
        }
      }

      const needsUpdate =
        dropChangesVisualOrder ||
        (newSortKey !== null &&
          (activeTaskForDrop.sort_key ?? MAX_SAFE_INTEGER_SORT) !== newSortKey);

      if (needsUpdate) {
        if (isMultiSelectMode && selectedTasks.size > 1) {
          const selectedTaskIds = Array.from(selectedTasks);
          const selectedTaskObjects = selectedTaskIds
            .map((taskId) => baseTasks.find((t) => t.id === taskId))
            .filter((t): t is Task => t !== undefined);

          const sortedTasksToMove = selectedTaskObjects.sort((a, b) => {
            const sortA = a.sort_key ?? MAX_SAFE_INTEGER_SORT;
            const sortB = b.sort_key ?? MAX_SAFE_INTEGER_SORT;
            if (sortA !== sortB) return sortA - sortB;
            if (!a.created_at || !b.created_at) return 0;
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          });

          if (
            targetIsExternalStaging &&
            sortedTasksToMove.some((task) => !usesPersonalPlacement(task))
          ) {
            toast.warning(
              invalidExternalStagingMoveMessage ??
                'Only external tasks can use the staging lane'
            );
            resetTaskDragAfterInvalidDrop();
            return;
          }

          const targetListTasksExcludingMoved = targetListTasks.filter(
            (t) => !selectedTasks.has(t.id)
          );

          let insertionIndex: number;
          if (isCompletionList) {
            insertionIndex = 0;
          } else if (overType === 'Task' || taskInsertionPreview) {
            const effectiveOverTaskId =
              taskInsertionPreview?.overTaskId ??
              (droppedOnPreviewPlaceholder &&
              latestDragPreviewPosition?.overTaskId
                ? latestDragPreviewPosition.overTaskId
                : String(over.id));
            const taskDropPosition =
              taskInsertionPreview?.position ??
              getEffectiveTaskDropPosition({
                droppedOnPreviewPlaceholder,
                event,
                preview: taskInsertionPreview ?? latestDragPreviewPosition,
              });
            insertionIndex = getTaskInsertionIndex({
              overTaskId: effectiveOverTaskId,
              position: taskDropPosition,
              tasks: targetListTasksExcludingMoved,
            });
          } else {
            insertionIndex = targetListTasksExcludingMoved.length;
          }

          const simulatedTargetList: Task[] = [
            ...targetListTasksExcludingMoved.slice(0, insertionIndex),
            ...sortedTasksToMove,
            ...targetListTasksExcludingMoved.slice(insertionIndex),
          ];

          try {
            for (const task of sortedTasksToMove) {
              if (targetIsExternalStaging) {
                await movePersonalPlacementTask(task, targetListId, null);
                continue;
              }

              let batchSortKey: number;
              const positionInSimulated = simulatedTargetList.findIndex(
                (t) => t.id === task.id
              );

              if (simulatedTargetList.length === 1) {
                batchSortKey = await calculateSortKeyWithRetry(
                  null,
                  null,
                  targetListId,
                  targetListTasks
                );
              } else if (positionInSimulated === 0) {
                const nextTask = simulatedTargetList[1];
                batchSortKey = await calculateSortKeyWithRetry(
                  null,
                  nextTask?.sort_key ?? null,
                  targetListId,
                  targetListTasks
                );
              } else if (
                positionInSimulated ===
                simulatedTargetList.length - 1
              ) {
                const prevTask = simulatedTargetList[positionInSimulated - 1];
                batchSortKey = await calculateSortKeyWithRetry(
                  prevTask?.sort_key ?? null,
                  null,
                  targetListId,
                  targetListTasks
                );
              } else {
                const prevTask = simulatedTargetList[positionInSimulated - 1];
                const nextTask = simulatedTargetList[positionInSimulated + 1];

                const prevIsMoving = prevTask
                  ? selectedTasks.has(prevTask.id)
                  : false;
                const nextIsMoving = nextTask
                  ? selectedTasks.has(nextTask.id)
                  : false;

                if (!prevIsMoving && !nextIsMoving) {
                  batchSortKey = await calculateSortKeyWithRetry(
                    prevTask?.sort_key ?? null,
                    nextTask?.sort_key ?? null,
                    targetListId,
                    targetListTasks
                  );
                } else if (prevIsMoving && !nextIsMoving) {
                  let stationaryPrev: Task | undefined;
                  for (let i = positionInSimulated - 1; i >= 0; i--) {
                    const currentTask = simulatedTargetList[i];
                    if (currentTask && !selectedTasks.has(currentTask.id)) {
                      stationaryPrev = currentTask;
                      break;
                    }
                  }
                  batchSortKey = await calculateSortKeyWithRetry(
                    stationaryPrev?.sort_key ?? null,
                    nextTask?.sort_key ?? null,
                    targetListId,
                    targetListTasks
                  );
                } else if (!prevIsMoving && nextIsMoving) {
                  let stationaryNext: Task | undefined;
                  for (
                    let i = positionInSimulated + 1;
                    i < simulatedTargetList.length;
                    i++
                  ) {
                    const currentTask = simulatedTargetList[i];
                    if (currentTask && !selectedTasks.has(currentTask.id)) {
                      stationaryNext = currentTask;
                      break;
                    }
                  }
                  batchSortKey = await calculateSortKeyWithRetry(
                    prevTask?.sort_key ?? null,
                    stationaryNext?.sort_key ?? null,
                    targetListId,
                    targetListTasks
                  );
                } else {
                  let boundaryPrev: Task | undefined;
                  let boundaryNext: Task | undefined;

                  for (let i = positionInSimulated - 1; i >= 0; i--) {
                    const currentTask = simulatedTargetList[i];
                    if (currentTask && !selectedTasks.has(currentTask.id)) {
                      boundaryPrev = currentTask;
                      break;
                    }
                  }

                  for (
                    let i = positionInSimulated + 1;
                    i < simulatedTargetList.length;
                    i++
                  ) {
                    const currentTask = simulatedTargetList[i];
                    if (currentTask && !selectedTasks.has(currentTask.id)) {
                      boundaryNext = currentTask;
                      break;
                    }
                  }

                  batchSortKey = await calculateSortKeyWithRetry(
                    boundaryPrev?.sort_key ?? null,
                    boundaryNext?.sort_key ?? null,
                    targetListId,
                    targetListTasks
                  );
                }
              }

              if (usesPersonalPlacement(task)) {
                await movePersonalPlacementTask(
                  task,
                  targetListId,
                  batchSortKey
                );
              } else {
                reorderTaskMutation.mutate(
                  {
                    taskId: task.id,
                    newListId: targetListId,
                    newSortKey: batchSortKey,
                  },
                  {
                    onSuccess: (updatedTask: Task) => {
                      broadcast?.('task:upsert', {
                        task: {
                          id: updatedTask.id,
                          list_id: updatedTask.list_id,
                          sort_key: updatedTask.sort_key,
                          completed_at: updatedTask.completed_at,
                          closed_at: updatedTask.closed_at,
                        },
                      });
                    },
                  }
                );
              }
            }
          } catch (error) {
            console.error(
              'Failed to calculate sort keys for batch move:',
              error
            );
            resetTaskDragAfterInvalidDrop();
            return;
          }

          clearSelection();
        } else {
          if (activeUsesPersonalPlacement || targetIsExternalStaging) {
            try {
              await movePersonalPlacementTask(
                activeTaskForDrop,
                targetListId,
                newSortKey,
                personalPlacementOrder
              );
            } catch (error) {
              console.error('Failed to update personal task placement:', error);
              rollbackOptimisticDropPreview();
              toast.error(
                personalPlacementUpdateFailedMessage ??
                  'Failed to update personal task placement'
              );
              resetDragState(true);
              return;
            }
          } else {
            const repairedTaskSortKeys =
              optimisticDropPreview?.repairedTaskSortKeys ?? [];
            const handleReorderSuccess = (updatedTask: Task) => {
              broadcast?.('task:upsert', {
                task: {
                  id: updatedTask.id,
                  list_id: updatedTask.list_id,
                  sort_key: updatedTask.sort_key,
                  completed_at: updatedTask.completed_at,
                  closed_at: updatedTask.closed_at,
                },
              });
            };

            if (repairedTaskSortKeys.length > 0) {
              void (async () => {
                const results = await Promise.allSettled(
                  repairedTaskSortKeys.map((repair) =>
                    reorderTaskMutation.mutateAsync(
                      {
                        taskId: repair.taskId,
                        newListId: repair.listId,
                        newSortKey: repair.sortKey,
                        optimisticPreviousFullTasks:
                          optimisticDropPreview?.previousFullTasks,
                        optimisticPreviousTasks:
                          optimisticDropPreview?.previousTasks,
                      },
                      {
                        onSuccess: handleReorderSuccess,
                      }
                    )
                  )
                );
                const failedResults = results.filter(
                  (result) => result.status === 'rejected'
                );

                if (failedResults.length === 0) return;

                console.error(
                  'Failed to persist repaired task sort keys:',
                  failedResults
                );
                rollbackOptimisticDropPreview();
                if (boardId) {
                  void queryClient.invalidateQueries({
                    queryKey: ['tasks', boardId],
                  });
                  void queryClient.invalidateQueries({
                    queryKey: ['tasks-full', boardId],
                  });
                }
                toast.error('Failed to reorder task');
              })();
            } else {
              reorderTaskMutation.mutate(
                {
                  taskId: activeTaskForDrop.id,
                  newListId: targetListId,
                  newSortKey: newSortKey ?? MAX_SAFE_INTEGER_SORT,
                  optimisticPreviousFullTasks:
                    optimisticDropPreview?.previousFullTasks,
                  optimisticPreviousTasks: optimisticDropPreview?.previousTasks,
                },
                {
                  onSuccess: handleReorderSuccess,
                }
              );
            }
          }
        }

        requestAnimationFrame(() => {
          resetDragState(true);
        });
      } else {
        restoreDragStartCache();
        resetDragState(true);
      }
    }
  }

  return {
    activeColumn,
    activeTask,
    hoverTargetListId,
    dragPreviewPosition,
    optimisticUpdateInProgress,
    onDragStart,
    onDragOver,
    onDragEnd,
  };
}
