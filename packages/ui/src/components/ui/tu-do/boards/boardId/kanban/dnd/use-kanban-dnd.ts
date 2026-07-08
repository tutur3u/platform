'use client';

import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
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
import { isPersonalExternalOverlayTask } from '../../../../../../../lib/task-personal-external';
import { useBoardBroadcast } from '../../../../shared/board-broadcast-context';
import { invalidateKanbanDeadlineTasks } from '../data/kanban-deadline-query';
import { MAX_SAFE_INTEGER_SORT } from '../kanban-constants';
import { getKanbanDragAutoScrollPointerX, useAutoScroll } from './auto-scroll';
import { getColumnReorderUpdates } from './column-reorder';
import { calculateSortKeyWithRetry as createCalculateSortKeyWithRetry } from './kanban-sort-helpers';
import {
  applyTaskDropPreviewToCache,
  hasTaskLocalMutationAt,
  mergePersonalPlacementMutationTask,
  setBoardTaskCache,
} from './task-drag-cache';
import {
  getFrozenActiveRectFromDelta,
  getTaskDropPositionFromRects,
} from './task-drag-geometry';
import {
  getNeighborTaskIds,
  getProjectedTaskDropOrderFromPreview,
  getTaskInsertionIndex,
  insertTaskAtDropPosition,
  insertTaskAtInsertionIndex,
  sortTasksForList,
} from './task-drag-order';
import {
  addPendingTaskIds,
  getPendingTaskIdsForDrop,
  removePendingTaskIds,
} from './task-drag-pending';
import {
  dragPreviewPositionsEqual,
  getTaskDropEndPreviewFromRects,
  getTaskDropPreviewFromListSurface,
  getTaskDropPreviewFromRects,
} from './task-drag-preview';
import type {
  DragCacheSnapshot,
  DragPreviewPosition,
  DragSessionMetrics,
  TaskRect,
  VerticalRect,
} from './task-drag-types';
import {
  compareTasksByEffectiveSortKey,
  getEffectiveTaskSortKey,
} from './task-sort-key';

export {
  applyTaskDropPreviewToCache,
  getTaskDropPreviewCacheTasks,
  hasTaskLocalMutationAt,
  mergePersonalPlacementMutationTask,
  mergeTaskIntoBoardTaskCache,
} from './task-drag-cache';
export {
  getFrozenActiveRectFromDelta,
  getTaskDropPositionFromRects,
} from './task-drag-geometry';
export {
  getProjectedTaskDropOrderFromPreview,
  getTaskInsertionIndex,
  insertTaskAtDropPosition,
  insertTaskAtInsertionIndex,
  sortTasksForList,
} from './task-drag-order';
export {
  dragPreviewPositionsEqual,
  getTaskDropEndPreviewFromRects,
  getTaskDropPreviewFromListSurface,
  getTaskDropPreviewFromRects,
} from './task-drag-preview';
export type {
  DragCacheSnapshot,
  DragPreviewPosition,
  DragSessionMetrics,
  TaskDropPosition,
  TaskRect,
  VerticalRect,
} from './task-drag-types';

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

export function usesPersonalPlacement(task: Task) {
  return isPersonalExternalOverlayTask(task);
}

export function getPersonalPlacementTargetBoardId({
  boardId,
  columns,
  targetListId,
}: {
  boardId: string | null;
  columns: Pick<TaskList, 'board_id' | 'id'>[];
  targetListId: string;
}) {
  const stagingBoardId = getPersonalExternalStagingBoardId(targetListId);
  if (stagingBoardId) return stagingBoardId;

  return (
    columns.find((column) => column.id === targetListId)?.board_id ?? boardId
  );
}

function getTaskDropPosition(
  event: DragMoveEvent | DragEndEvent,
  pointerY?: number | null,
  dragSession?: DragSessionMetrics | null
) {
  return getTaskDropPositionFromRects({
    activeRect: getActiveDragRect(event, dragSession),
    overRect: event.over?.rect,
    pointerY,
  });
}

function getActiveDragRect(
  event: DragMoveEvent | DragEndEvent,
  dragSession?: DragSessionMetrics | null
) {
  const translatedRect = event.active.rect.current.translated;
  const fallbackRect = translatedRect ?? event.active.rect.current.initial;

  return getFrozenActiveRectFromDelta({
    deltaY: event.delta?.y,
    dragSession,
    fallbackRect: fallbackRect
      ? {
          height: fallbackRect.height,
          top: fallbackRect.top,
        }
      : null,
    translatedRect: translatedRect
      ? {
          height: translatedRect.height,
          top: translatedRect.top,
        }
      : null,
  });
}

function getVisibleTaskRectsForList(
  listId: string,
  originalIndexesByTaskId?: Map<string, number>
) {
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
        originalIndex:
          originalIndexesByTaskId?.get(element.dataset.taskCardId ?? '') ??
          Number.MAX_SAFE_INTEGER,
        top: rect.top,
        height: rect.height,
        width: rect.width,
      };
    })
    .filter((rect) => rect.taskId && rect.height > 0 && rect.width > 0)
    .sort((a, b) => {
      const indexA = a.originalIndex ?? Number.MAX_SAFE_INTEGER;
      const indexB = b.originalIndex ?? Number.MAX_SAFE_INTEGER;

      if (indexA !== indexB) {
        return indexA - indexB;
      }

      return a.top - b.top;
    });
}

function getProjectedTaskDropOrder({
  activeTask,
  event,
  isCompletionList,
  latestDragPreviewPosition,
  overId,
  overType,
  pointerY,
  targetListTasks,
  dragSession,
}: {
  activeTask: Task;
  dragSession?: DragSessionMetrics | null;
  event: DragMoveEvent | DragEndEvent;
  isCompletionList: boolean;
  latestDragPreviewPosition: DragPreviewPosition | null;
  overId: string;
  overType: unknown;
  pointerY?: number | null;
  targetListTasks: Task[];
}) {
  const targetListTasksWithoutActive = targetListTasks.filter(
    (task) => task.id !== activeTask.id
  );

  if (isCompletionList || overType === 'Column') {
    return [activeTask, ...targetListTasksWithoutActive];
  }

  if (latestDragPreviewPosition) {
    return insertTaskAtInsertionIndex({
      activeTask,
      insertionIndex: latestDragPreviewPosition.insertionIndex,
      targetListTasks,
    });
  }

  const overIndex = targetListTasksWithoutActive.findIndex(
    (task) => task.id === overId
  );

  if (overIndex === -1) {
    return [...targetListTasksWithoutActive, activeTask];
  }

  return insertTaskAtDropPosition({
    activeTask,
    overTaskId: overId,
    position: getTaskDropPosition(event, pointerY, dragSession),
    targetListTasks,
  });
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
  const dragSessionMetricsRef = useRef<DragSessionMetrics | null>(null);
  const dragStartTaskIndexesByListRef = useRef<
    Map<string, Map<string, number>>
  >(new Map());

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

    const rects = getVisibleTaskRectsForList(
      listId,
      dragStartTaskIndexesByListRef.current.get(listId)
    );
    taskRectsCacheRef.current.set(listId, rects);

    return rects;
  }, []);

  const getDragPreviewForList = useCallback(
    ({
      activeRect,
      activeTask,
      listId,
      preferEnd,
    }: {
      activeRect: VerticalRect | null;
      activeTask: Task;
      listId: string;
      preferEnd?: boolean;
    }) => {
      const dragSession = dragSessionMetricsRef.current;
      const height =
        dragSession?.activeTaskId === activeTask.id
          ? dragSession.height
          : (taskHeightsRef.current.get(activeTask.id) ?? 96);
      const visibleTaskRects = getCachedVisibleTaskRects(listId);
      const preview = preferEnd
        ? getTaskDropEndPreviewFromRects({
            activeTask,
            height,
            listId,
            rects: visibleTaskRects,
          })
        : getTaskDropPreviewFromRects({
            activeRect,
            activeTask,
            dragSession,
            height,
            listId,
            rects: visibleTaskRects,
          });

      if (
        dragSession?.activeTaskId === activeTask.id &&
        dragSession.sourceListId === preview.listId &&
        dragSession.sourceInsertionIndex === preview.insertionIndex
      ) {
        return null;
      }

      return preview;
    },
    [getCachedVisibleTaskRects, taskHeightsRef]
  );

  const getDragPreviewForListSurface = useCallback(
    ({
      activeRect,
      activeTask,
      listId,
    }: {
      activeRect: VerticalRect | null;
      activeTask: Task;
      listId: string;
    }) => {
      const dragSession = dragSessionMetricsRef.current;
      const height =
        dragSession?.activeTaskId === activeTask.id
          ? dragSession.height
          : (taskHeightsRef.current.get(activeTask.id) ?? 96);
      const visibleTaskRects = getCachedVisibleTaskRects(listId);
      const preview = getTaskDropPreviewFromListSurface({
        activeRect,
        activeTask,
        dragSession,
        height,
        listId,
        rects: visibleTaskRects,
      });

      if (
        dragSession?.activeTaskId === activeTask.id &&
        dragSession.sourceListId === preview.listId &&
        dragSession.sourceInsertionIndex === preview.insertionIndex
      ) {
        return null;
      }

      return preview;
    },
    [getCachedVisibleTaskRects, taskHeightsRef]
  );

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
      const targetBoardId = getPersonalPlacementTargetBoardId({
        boardId,
        columns,
        targetListId,
      });
      if (!targetBoardId) {
        throw new Error('Board ID is required');
      }
      const isStagingTarget = stagingBoardId !== null;
      const targetList = columns.find((column) => column.id === targetListId);
      const terminalStatus =
        targetList?.status === 'done' || targetList?.status === 'closed'
          ? targetList.status
          : undefined;
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
      const previousTask = previousTasks?.find((item) => item.id === task.id);
      const previousFullTask = previousFullTasks?.find(
        (item) => item.id === task.id
      );

      setBoardTaskCache(queryClient, boardId, nextTask);

      try {
        const response = isStagingTarget
          ? null
          : await upsertCurrentUserTaskPersonalPlacement(task.id, {
              personal_board_id: targetBoardId,
              personal_list_id: targetListId,
              personal_sort_key: newSortKey,
              previous_task_id: order?.previousTaskId ?? null,
              next_task_id: order?.nextTaskId ?? null,
              terminal_status: terminalStatus,
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
        const restoreTaskInCache = (
          queryKey: unknown[],
          previousTaskValue: Task | undefined,
          previousCache: Task[] | undefined
        ) => {
          queryClient.setQueryData<Task[]>(queryKey, (currentTasks) => {
            if (!currentTasks) return previousCache;

            if (
              !hasTaskLocalMutationAt(
                currentTasks,
                task.id,
                nextTask._localMutationAt
              )
            ) {
              return currentTasks;
            }

            if (!previousTaskValue) {
              return currentTasks.filter((item) => item.id !== task.id);
            }

            const hasTask = currentTasks.some((item) => item.id === task.id);
            if (!hasTask) return [...currentTasks, previousTaskValue];

            return currentTasks.map((item) =>
              item.id === task.id ? previousTaskValue : item
            );
          });
        };

        restoreTaskInCache(['tasks', boardId], previousTask, previousTasks);
        restoreTaskInCache(
          ['tasks-full', boardId],
          previousFullTask,
          previousFullTasks
        );
        throw error;
      }
    },
    [boardId, columns, queryClient]
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

  const { startAutoScroll, stopAutoScroll, updateAutoScrollPointerX } =
    useAutoScroll(scrollContainerRef);

  const updateAutoScrollFromDragEvent = useCallback(
    (event: DragMoveEvent | DragOverEvent | DragStartEvent) => {
      updateAutoScrollPointerX(getKanbanDragAutoScrollPointerX(event));
    },
    [updateAutoScrollPointerX]
  );

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
      dragSessionMetricsRef.current = null;
      dragStartTaskIndexesByListRef.current.clear();
      isDraggingRef.current = false;
      stopAutoScroll();

      if (clearOptimisticUpdates) {
        setOptimisticUpdateInProgress(new Set());
      }
    },
    [setDragPreviewPosition, stopAutoScroll]
  );

  const markTaskIdsPending = useCallback((taskIds: string[]) => {
    if (taskIds.length === 0) return;

    setOptimisticUpdateInProgress((prev) => addPendingTaskIds(prev, taskIds));
  }, []);

  const clearPendingTaskIds = useCallback((taskIds: string[]) => {
    if (taskIds.length === 0) return;

    setOptimisticUpdateInProgress((prev) =>
      removePendingTaskIds(prev, taskIds)
    );
  }, []);

  const processTaskDragPreview = useCallback(
    (event: DragMoveEvent) => {
      updateAutoScrollFromDragEvent(event);

      const { active, over } = event;
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

        if (!over) {
          const targetListId = String(
            dragPreviewPositionRef.current?.listId ??
              lastTargetListIdRef.current ??
              pickedUpTaskColumn.current ??
              activeTask.list_id
          );
          const targetListExists = columns.some(
            (col) => String(col.id) === targetListId
          );

          if (!targetListExists) {
            setHoverTargetListId(null);
            setDragPreviewPosition(null);
            return;
          }

          const nextPreviewPosition = getDragPreviewForListSurface({
            activeRect: getActiveDragRect(event, dragSessionMetricsRef.current),
            activeTask,
            listId: targetListId,
          });

          setDragPreviewPosition(nextPreviewPosition);
          setHoverTargetListId((current) =>
            current === targetListId ? current : targetListId
          );
          lastTargetListIdRef.current = targetListId;
          return;
        }

        let targetListId: string;
        const overType = over.data?.current?.type;
        let nextPreviewPosition: DragPreviewPosition | null = null;
        const dragSession = dragSessionMetricsRef.current;
        const activeRect = getActiveDragRect(event, dragSession);

        if (overType === 'Column') {
          targetListId = String(over.id);
          nextPreviewPosition = getDragPreviewForListSurface({
            activeRect,
            activeTask,
            listId: targetListId,
          });
          setDragPreviewPosition(nextPreviewPosition);
        } else if (overType === 'Task') {
          if (String(over.id) === String(active.id)) {
            const overTask = over.data?.current?.task as Task | undefined;
            const currentPreview = dragPreviewPositionRef.current;
            targetListId = String(
              overTask?.list_id ?? currentPreview?.listId ?? activeTask.list_id
            );
            nextPreviewPosition = getDragPreviewForList({
              activeRect,
              activeTask,
              listId: targetListId,
            });
            setDragPreviewPosition(nextPreviewPosition);
          } else {
            const overTask = over.data?.current?.task as Task | undefined;
            if (!overTask) return;
            targetListId = String(overTask.list_id);
            nextPreviewPosition = getDragPreviewForList({
              activeRect,
              activeTask,
              listId: targetListId,
            });
            setDragPreviewPosition(nextPreviewPosition);
          }
        } else if (overType === 'ColumnSurface') {
          const columnId = over.data?.current?.columnId || over.id;
          if (!columnId) return;
          targetListId = String(columnId);
          nextPreviewPosition = getDragPreviewForListSurface({
            activeRect,
            activeTask,
            listId: targetListId,
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
      getDragPreviewForList,
      getDragPreviewForListSurface,
      setDragPreviewPosition,
      updateAutoScrollFromDragEvent,
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
    updateAutoScrollFromDragEvent(event);
    startAutoScroll();

    const { type } = active.data.current;
    if (type === 'Column') {
      setActiveColumn(active.data.current.column);
      return;
    }
    if (type === 'Task') {
      if (!wsId) {
        resetDragState(true);
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
      dragStartTaskIndexesByListRef.current.clear();

      const dragStartTasks = dragStartCacheRef.current?.tasks ?? tasks;
      for (const column of columns) {
        const orderedListTasks = sortTasksForList({
          disableSort,
          targetList: column,
          tasks: dragStartTasks.filter(
            (item) => String(item.list_id) === String(column.id)
          ),
        });
        dragStartTaskIndexesByListRef.current.set(
          String(column.id),
          new Map(orderedListTasks.map((item, index) => [item.id, index]))
        );
      }

      const sourceListId = String(task.list_id);
      const sourceList = columns.find(
        (column) => String(column.id) === sourceListId
      );
      const sourceTasks = sortTasksForList({
        disableSort,
        targetList: sourceList,
        tasks: dragStartTasks.filter(
          (item) => String(item.list_id) === sourceListId
        ),
      });
      const sourceInsertionIndex = Math.max(
        0,
        sourceTasks.findIndex((item) => item.id === task.id)
      );
      const initialRect = event.active.rect.current.initial
        ? {
            height: event.active.rect.current.initial.height,
            top: event.active.rect.current.initial.top,
          }
        : null;
      const activeHeight =
        initialRect?.height || taskHeightsRef.current.get(task.id) || 96;
      dragSessionMetricsRef.current = {
        activeInitialRect: initialRect,
        activeTaskId: task.id,
        height: Math.max(1, Math.round(activeHeight)),
        sourceInsertionIndex,
        sourceListId,
      };

      // If this is a multi-select drag, include all selected tasks
      if (isMultiSelectMode && selectedTasks.has(task.id)) {
        setActiveTask(task); // Set the dragged task as active for overlay
      } else {
        setActiveTask(task);
      }

      pickedUpTaskColumn.current = sourceListId;
      lastTargetListIdRef.current = sourceListId;
      setHoverTargetListId(sourceListId);
      return;
    }
  }

  function onDragOver(event: DragOverEvent) {
    processTaskDragPreview(event);
  }

  function onDragMove(event: DragMoveEvent) {
    processTaskDragPreview(event);
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

      if (
        !latestPreviewForActive &&
        overType === 'Task' &&
        String(over.id) === String(active.id)
      ) {
        restoreDragStartCache();
        resetDragState(true);
        return;
      }

      if (latestPreviewForActive) {
        targetListId = latestPreviewForActive.listId;
      } else if (overType === 'Column') {
        targetListId = String(over.id);
      } else if (overType === 'Task') {
        const targetTask = over.data?.current?.task;
        if (!targetTask) {
          resetTaskDragAfterInvalidDrop();
          return;
        }
        targetListId = String(targetTask.list_id);
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
              dragSession: dragSessionMetricsRef.current,
              event,
              isCompletionList,
              latestDragPreviewPosition: latestPreviewForActive,
              overId: String(over.id),
              overType,
              targetListTasks,
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
          const currentTasks = queryClient.getQueryData<Task[]>([
            'tasks',
            boardId,
          ]);

          if (
            hasTaskLocalMutationAt(
              currentTasks,
              activeTaskForDrop.id,
              optimisticDropPreview.localMutationAt
            )
          ) {
            queryClient.setQueryData(
              ['tasks', boardId],
              optimisticDropPreview.previousTasks
            );
          }
        }

        if (optimisticDropPreview.previousFullTasks) {
          const currentFullTasks = queryClient.getQueryData<Task[]>([
            'tasks-full',
            boardId,
          ]);

          if (
            hasTaskLocalMutationAt(
              currentFullTasks,
              activeTaskForDrop.id,
              optimisticDropPreview.localMutationAt
            )
          ) {
            queryClient.setQueryData(
              ['tasks-full', boardId],
              optimisticDropPreview.previousFullTasks
            );
          }
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
              nextTask ? getEffectiveTaskSortKey(nextTask) : null,
              targetListId,
              projectedDropOrder
            );
          } else if (newIndex === projectedDropOrder.length - 1) {
            const prevTask = projectedDropOrder[projectedDropOrder.length - 2];
            newSortKey = await calculateSortKeyWithRetry(
              prevTask ? getEffectiveTaskSortKey(prevTask) : null,
              null,
              targetListId,
              projectedDropOrder
            );
          } else {
            const prevTask = projectedDropOrder[newIndex - 1];
            const nextTask = projectedDropOrder[newIndex + 1];
            newSortKey = await calculateSortKeyWithRetry(
              prevTask ? getEffectiveTaskSortKey(prevTask) : null,
              nextTask ? getEffectiveTaskSortKey(nextTask) : null,
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
          (getEffectiveTaskSortKey(activeTaskForDrop) ??
            MAX_SAFE_INTEGER_SORT) !== newSortKey);

      let shouldPreservePendingAfterDragReset = false;
      const persistPersonalPlacementMove = (
        task: Task,
        sortKey: number | null,
        order?: {
          previousTaskId?: string | null;
          nextTaskId?: string | null;
        }
      ) => {
        const pendingTaskIds = [task.id];
        markTaskIdsPending(pendingTaskIds);
        shouldPreservePendingAfterDragReset = true;

        void movePersonalPlacementTask(task, targetListId, sortKey, order)
          .then((updatedTask) => {
            broadcast?.('task:upsert', {
              task: {
                id: updatedTask.id,
                list_id: updatedTask.list_id,
                sort_key: updatedTask.sort_key,
                personal_sort_key: updatedTask.personal_sort_key,
                completed_at: updatedTask.completed_at,
                closed_at: updatedTask.closed_at,
              },
            });
            void invalidateKanbanDeadlineTasks(queryClient, boardId);
          })
          .catch((error) => {
            console.error('Failed to update personal task placement:', error);
            rollbackOptimisticDropPreview();
            toast.error(
              personalPlacementUpdateFailedMessage ??
                'Failed to update personal task placement'
            );
          })
          .finally(() => {
            clearPendingTaskIds(pendingTaskIds);
          });
      };

      if (needsUpdate) {
        if (isMultiSelectMode && selectedTasks.size > 1) {
          const selectedTaskIds = Array.from(selectedTasks);
          const selectedTaskObjects = selectedTaskIds
            .map((taskId) => baseTasks.find((t) => t.id === taskId))
            .filter((t): t is Task => t !== undefined);

          const sortedTasksToMove = selectedTaskObjects.sort(
            compareTasksByEffectiveSortKey
          );

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
          } else if (latestPreviewForActive?.listId === targetListId) {
            insertionIndex = latestPreviewForActive.insertionIndex;
          } else if (overType === 'Task') {
            insertionIndex = getTaskInsertionIndex({
              overTaskId: String(over.id),
              position: getTaskDropPosition(
                event,
                undefined,
                dragSessionMetricsRef.current
              ),
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
                persistPersonalPlacementMove(task, null);
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
                  nextTask ? getEffectiveTaskSortKey(nextTask) : null,
                  targetListId,
                  targetListTasks
                );
              } else if (
                positionInSimulated ===
                simulatedTargetList.length - 1
              ) {
                const prevTask = simulatedTargetList[positionInSimulated - 1];
                batchSortKey = await calculateSortKeyWithRetry(
                  prevTask ? getEffectiveTaskSortKey(prevTask) : null,
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
                    prevTask ? getEffectiveTaskSortKey(prevTask) : null,
                    nextTask ? getEffectiveTaskSortKey(nextTask) : null,
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
                    stationaryPrev
                      ? getEffectiveTaskSortKey(stationaryPrev)
                      : null,
                    nextTask ? getEffectiveTaskSortKey(nextTask) : null,
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
                    prevTask ? getEffectiveTaskSortKey(prevTask) : null,
                    stationaryNext
                      ? getEffectiveTaskSortKey(stationaryNext)
                      : null,
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
                    boundaryPrev ? getEffectiveTaskSortKey(boundaryPrev) : null,
                    boundaryNext ? getEffectiveTaskSortKey(boundaryNext) : null,
                    targetListId,
                    targetListTasks
                  );
                }
              }

              if (usesPersonalPlacement(task)) {
                persistPersonalPlacementMove(task, batchSortKey);
              } else {
                const pendingTaskIds = [task.id];
                markTaskIdsPending(pendingTaskIds);
                shouldPreservePendingAfterDragReset = true;

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
                      void invalidateKanbanDeadlineTasks(queryClient, boardId);
                    },
                    onSettled: () => {
                      clearPendingTaskIds(pendingTaskIds);
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
            persistPersonalPlacementMove(
              activeTaskForDrop,
              newSortKey,
              personalPlacementOrder
            );
          } else {
            const repairedTaskSortKeys =
              optimisticDropPreview?.repairedTaskSortKeys ?? [];
            const pendingTaskIds = getPendingTaskIdsForDrop({
              activeTaskId: activeTaskForDrop.id,
              repairedTaskSortKeys,
            });
            markTaskIdsPending(pendingTaskIds);
            shouldPreservePendingAfterDragReset = true;

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
              void invalidateKanbanDeadlineTasks(queryClient, boardId);
            };

            if (repairedTaskSortKeys.length > 0) {
              void (async () => {
                try {
                  const repairTaskById = new Map<string, Task>();
                  for (const task of [
                    ...baseTasks,
                    ...(optimisticDropPreview?.previousTasks ?? []),
                    ...(optimisticDropPreview?.previousFullTasks ?? []),
                  ]) {
                    repairTaskById.set(task.id, task);
                  }

                  const results = await Promise.allSettled(
                    repairedTaskSortKeys.map(async (repair) => {
                      const repairTask = repairTaskById.get(repair.taskId);

                      if (repairTask && usesPersonalPlacement(repairTask)) {
                        const updatedTask = await movePersonalPlacementTask(
                          repairTask,
                          repair.listId,
                          repair.sortKey
                        );
                        broadcast?.('task:upsert', {
                          task: {
                            id: updatedTask.id,
                            list_id: updatedTask.list_id,
                            sort_key: updatedTask.sort_key,
                            personal_sort_key: updatedTask.personal_sort_key,
                            completed_at: updatedTask.completed_at,
                            closed_at: updatedTask.closed_at,
                          },
                        });
                        return updatedTask;
                      }

                      return reorderTaskMutation.mutateAsync(
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
                      );
                    })
                  );
                  const failedResults = results.filter(
                    (result) => result.status === 'rejected'
                  );

                  if (failedResults.length === 0) {
                    void invalidateKanbanDeadlineTasks(queryClient, boardId);
                    return;
                  }

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
                } finally {
                  clearPendingTaskIds(pendingTaskIds);
                }
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
                  onSettled: () => {
                    clearPendingTaskIds(pendingTaskIds);
                  },
                }
              );
            }
          }
        }

        requestAnimationFrame(() => {
          resetDragState(!shouldPreservePendingAfterDragReset);
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
    onDragMove,
    onDragOver,
    onDragEnd,
  };
}
