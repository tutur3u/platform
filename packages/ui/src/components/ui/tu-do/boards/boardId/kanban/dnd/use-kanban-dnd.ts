'use client';

import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { hasDraggableData } from '@tuturuuu/utils/task-helpers';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  reorderTaskMutation: any;
  taskHeightsRef: React.RefObject<Map<string, number>>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
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
  const [dragPreviewPosition, setDragPreviewPosition] = useState<{
    listId: string;
    overTaskId: string | null;
    position: 'before' | 'after' | 'empty';
    task: Task;
    height: number;
  } | null>(null);
  const [optimisticUpdateInProgress, setOptimisticUpdateInProgress] = useState<
    Set<string>
  >(new Set());

  // Refs for drag state
  const pickedUpTaskColumn = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const lastTargetListIdRef = useRef<string | null>(null);

  const queryClient = useQueryClient();
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

  const resetDragState = useCallback((clearOptimisticUpdates = false) => {
    setActiveColumn(null);
    setActiveTask(null);
    setHoverTargetListId(null);
    setDragPreviewPosition(null);
    pickedUpTaskColumn.current = null;
    lastTargetListIdRef.current = null;
    isDraggingRef.current = false;

    if (clearOptimisticUpdates) {
      setOptimisticUpdateInProgress(new Set());
    }
  }, []);

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

        // Get cached height for the dragged task, fallback to 96px
        const cachedHeight = taskHeightsRef.current.get(activeTask.id) || 96;

        if (overType === 'Column') {
          targetListId = String(over.id);
          // Dropping on column header - preview at beginning
          setDragPreviewPosition({
            listId: targetListId,
            overTaskId: null,
            position: 'before',
            task: activeTask,
            height: cachedHeight,
          });
        } else if (overType === 'Task') {
          targetListId = String(over.data?.current?.task.list_id);
          // Dropping on a task - preview before that task
          setDragPreviewPosition({
            listId: targetListId,
            overTaskId: String(over.id),
            position: 'before',
            task: activeTask,
            height: cachedHeight,
          });
        } else if (overType === 'ColumnSurface') {
          const columnId = over.data?.current?.columnId || over.id;
          if (!columnId) return;
          targetListId = String(columnId);
          // Dropping on empty column surface - preview at end
          setDragPreviewPosition({
            listId: targetListId,
            overTaskId: null,
            position: 'empty',
            task: activeTask,
            height: cachedHeight,
          });
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
    [columns, taskHeightsRef, wsId]
  );

  // Global drag state reset on mouseup/touchend
  useEffect(() => {
    function handleGlobalPointerUp() {
      resetDragState();
    }
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
    };
  }, [resetDragState]);

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

    if (!over) {
      // Reset drag state only on invalid drop
      resetDragState(true);
      return;
    }

    const activeType = active.data?.current?.type;

    if (!activeType) {
      resetDragState(true);
      return;
    }

    if (activeType === 'Task' && !wsId) {
      resetDragState(true);
      return;
    }

    // Handle column reordering
    if (activeType === 'Column') {
      const activeColumn = active.data?.current?.column;
      const overColumn = over.data?.current?.column;

      if (activeColumn && overColumn && activeColumn.id !== overColumn.id) {
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

      if (!activeTask) {
        resetDragState(true);
        return;
      }

      let targetListId: string;
      const overType = over.data?.current?.type;

      if (overType === 'Column') {
        targetListId = String(over.id);
      } else if (overType === 'Task') {
        // When dropping on a task, use the list_id of the target task
        const targetTask = over.data?.current?.task;
        if (!targetTask) {
          resetDragState(true);
          return;
        }
        targetListId = String(targetTask.list_id);
      } else if (overType === 'ColumnSurface') {
        const columnId = over.data?.current?.columnId || over.id;
        if (!columnId) {
          resetDragState(true);
          return;
        }
        targetListId = String(columnId);
      } else {
        resetDragState(true);
        return;
      }

      if (!originalListId) {
        resetDragState(true);
        return;
      }

      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );

      if (!sourceListExists || !targetListExists) {
        resetDragState(true);
        return;
      }

      // Calculate target position based on drop location
      // Get all tasks in the target list (INCLUDE the dragged task if it's in the same list)
      let targetListTasks = tasks.filter((t) => t.list_id === targetListId);

      // Find the target list to check its status
      const targetList = columns.find((col) => String(col.id) === targetListId);

      // IMPORTANT: For "done" and "closed" lists, always place at first position (top)
      const isCompletionList =
        targetList?.status === 'done' || targetList?.status === 'closed';

      // Sort tasks
      targetListTasks = targetListTasks.sort((a, b) => {
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

      // Calculate new sort_key based on drop location
      let newSortKey: number;

      if (isCompletionList) {
        try {
          if (targetListTasks.length === 0) {
            newSortKey = await calculateSortKeyWithRetry(
              null,
              null,
              targetListId,
              targetListTasks
            );
          } else {
            const firstTask = targetListTasks[0];
            newSortKey = await calculateSortKeyWithRetry(
              null,
              firstTask?.sort_key ?? null,
              targetListId,
              targetListTasks
            );
          }
        } catch (error) {
          console.error('Failed to calculate sort key:', error);
          resetDragState(true);
          return;
        }
      } else if (overType === 'Task') {
        const activeIndex = targetListTasks.findIndex(
          (t) => t.id === active.id
        );
        const overIndex = targetListTasks.findIndex((t) => t.id === over.id);

        let reorderedTasks: Task[];
        const isSameList = originalListId === targetListId;

        if (isSameList && activeIndex !== -1) {
          reorderedTasks = arrayMove(targetListTasks, activeIndex, overIndex);
        } else {
          const tasksWithoutActive = targetListTasks.filter(
            (t) => t.id !== activeTask.id
          );
          const overTaskInFiltered = tasksWithoutActive.findIndex(
            (t) => t.id === over.id
          );

          if (overTaskInFiltered === -1) {
            reorderedTasks = [...tasksWithoutActive, activeTask];
          } else {
            reorderedTasks = [
              ...tasksWithoutActive.slice(0, overTaskInFiltered),
              activeTask,
              ...tasksWithoutActive.slice(overTaskInFiltered),
            ];
          }
        }

        const newIndex = reorderedTasks.findIndex(
          (t) => t.id === activeTask.id
        );

        try {
          if (reorderedTasks.length === 1) {
            newSortKey = await calculateSortKeyWithRetry(
              null,
              null,
              targetListId,
              targetListTasks
            );
          } else if (newIndex === 0) {
            const nextTask = reorderedTasks[1];
            newSortKey = await calculateSortKeyWithRetry(
              null,
              nextTask?.sort_key ?? null,
              targetListId,
              targetListTasks
            );
          } else if (newIndex === reorderedTasks.length - 1) {
            const prevTask = reorderedTasks[reorderedTasks.length - 2];
            newSortKey = await calculateSortKeyWithRetry(
              prevTask?.sort_key ?? null,
              null,
              targetListId,
              targetListTasks
            );
          } else {
            const prevTask = reorderedTasks[newIndex - 1];
            const nextTask = reorderedTasks[newIndex + 1];
            newSortKey = await calculateSortKeyWithRetry(
              prevTask?.sort_key ?? null,
              nextTask?.sort_key ?? null,
              targetListId,
              targetListTasks
            );
          }
        } catch (error) {
          console.error('Failed to calculate sort key:', error);
          resetDragState(true);
          return;
        }
      } else {
        try {
          if (targetListTasks.length === 0) {
            newSortKey = await calculateSortKeyWithRetry(
              null,
              null,
              targetListId,
              targetListTasks
            );
          } else if (overType === 'Column') {
            const firstTask = targetListTasks[0];
            newSortKey = await calculateSortKeyWithRetry(
              null,
              firstTask?.sort_key ?? null,
              targetListId,
              targetListTasks
            );
          } else {
            const lastTask = targetListTasks[targetListTasks.length - 1];
            newSortKey = await calculateSortKeyWithRetry(
              lastTask?.sort_key ?? null,
              null,
              targetListId,
              targetListTasks
            );
          }
        } catch (error) {
          console.error('Failed to calculate sort key:', error);
          resetDragState(true);
          return;
        }
      }

      const needsUpdate =
        targetListId !== originalListId ||
        (activeTask.sort_key ?? MAX_SAFE_INTEGER_SORT) !== newSortKey;

      if (needsUpdate) {
        if (isMultiSelectMode && selectedTasks.size > 1) {
          const selectedTaskIds = Array.from(selectedTasks);
          const selectedTaskObjects = selectedTaskIds
            .map((taskId) => tasks.find((t) => t.id === taskId))
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

          const targetListTasksExcludingMoved = targetListTasks.filter(
            (t) => !selectedTasks.has(t.id)
          );

          let insertionIndex: number;
          if (isCompletionList) {
            insertionIndex = 0;
          } else if (overType === 'Task') {
            const overTaskInFiltered = targetListTasksExcludingMoved.findIndex(
              (t) => t.id === over.id
            );

            if (overTaskInFiltered === -1) {
              insertionIndex = targetListTasksExcludingMoved.length;
            } else {
              insertionIndex = overTaskInFiltered;
            }
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
          } catch (error) {
            console.error(
              'Failed to calculate sort keys for batch move:',
              error
            );
            resetDragState(true);
            return;
          }

          clearSelection();
        } else {
          reorderTaskMutation.mutate(
            {
              taskId: activeTask.id,
              newListId: targetListId,
              newSortKey,
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

        requestAnimationFrame(() => {
          resetDragState(true);
        });
      } else {
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
