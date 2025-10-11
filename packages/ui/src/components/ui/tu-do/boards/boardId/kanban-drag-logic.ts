/**
 * Drag & drop logic for kanban board
 * Handles task reordering, column reordering, multi-select batch moves, and sort key calculation
 */

import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { hasDraggableData } from '@tuturuuu/utils/task-helpers';
import type { RefObject } from 'react';
import {
  DEFAULT_TASK_HEIGHT,
  MAX_SAFE_INTEGER_SORT,
  STATUS_ORDER,
} from './kanban-constants';

interface DragPreviewPosition {
  listId: string;
  overTaskId: string | null;
  position: 'before' | 'after' | 'empty';
  task: Task;
  height: number;
}

interface DragHandlersConfig {
  // State management
  setActiveColumn: (column: TaskList | null) => void;
  setActiveTask: (task: Task | null) => void;
  setHoverTargetListId: (listId: string | null) => void;
  setDragPreviewPosition: (position: DragPreviewPosition | null) => void;
  setOptimisticUpdateInProgress: (tasks: Set<string>) => void;

  // Data
  columns: TaskList[];
  tasks: Task[];
  disableSort: boolean;

  // Multi-select
  selectedTasks: Set<string>;
  isMultiSelectMode: boolean;
  clearSelection: () => void;

  // Refs
  pickedUpTaskColumn: RefObject<string | null>;
  taskHeightsRef: RefObject<Map<string, number>>;

  // Query & mutations
  queryClient: QueryClient;
  boardId: string;
  reorderTaskMutation: UseMutationResult<any, any, any, any>;
  moveListMutation: UseMutationResult<any, any, any, any>;

  // Dependencies
  calculateSortKeyWithRetry: (
    prevSortKey: number | null | undefined,
    nextSortKey: number | null | undefined,
    listId: string
  ) => Promise<number>;
}

/**
 * Creates drag & drop handlers with all necessary dependencies
 */
export function createDragHandlers(config: DragHandlersConfig) {
  const {
    setActiveColumn,
    setActiveTask,
    setHoverTargetListId,
    setDragPreviewPosition,
    setOptimisticUpdateInProgress,
    columns,
    tasks,
    disableSort,
    selectedTasks,
    isMultiSelectMode,
    clearSelection,
    pickedUpTaskColumn,
    taskHeightsRef,
    queryClient,
    boardId,
    reorderTaskMutation,
    moveListMutation,
    calculateSortKeyWithRetry,
  } = config;

  /**
   * Reset all drag-related state
   */
  function resetDragState() {
    setActiveColumn(null);
    setActiveTask(null);
    setHoverTargetListId(null);
    setDragPreviewPosition(null);
    pickedUpTaskColumn.current = null;
    (processDragOver as any).lastTargetListId = null;
    setOptimisticUpdateInProgress(new Set());
  }

  /**
   * Handle drag start - capture the dragged item
   */
  function onDragStart(event: DragStartEvent) {
    if (!hasDraggableData(event.active)) return;
    const { active } = event;
    if (!active.data?.current) return;

    const { type } = active.data.current;
    if (type === 'Column') {
      setActiveColumn(active.data.current.column);
      return;
    }
    if (type === 'Task') {
      const task = active.data.current.task;
      console.log('🎯 onDragStart - Task:', task);
      console.log('📋 Task list_id:', task.list_id);
      console.log('📋 Selected tasks:', selectedTasks);
      console.log('📋 Is multi-select mode:', isMultiSelectMode);

      // If this is a multi-select drag, include all selected tasks
      if (isMultiSelectMode && selectedTasks.has(task.id)) {
        console.log('📋 Multi-select drag detected');
        console.log('📋 Number of selected tasks:', selectedTasks.size);
        setActiveTask(task); // Set the dragged task as active for overlay
      } else {
        setActiveTask(task);
      }

      pickedUpTaskColumn.current = String(task.list_id);
      console.log('📋 pickedUpTaskColumn set to:', pickedUpTaskColumn.current);
      setHoverTargetListId(String(task.list_id));
      return;
    }
  }

  /**
   * Process drag over event to show visual preview
   */
  function processDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) {
      if ((processDragOver as any).lastTargetListId) {
        (processDragOver as any).lastTargetListId = null;
        setHoverTargetListId(null);
        setDragPreviewPosition(null);
      }
      return;
    }

    const activeType = active.data?.current?.type;
    if (!activeType) return;

    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      if (!activeTask) return;

      let targetListId: string;
      const overType = over.data?.current?.type;

      // Get cached height for the dragged task, fallback to DEFAULT_TASK_HEIGHT
      const cachedHeight =
        taskHeightsRef.current.get(activeTask.id) || DEFAULT_TASK_HEIGHT;

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
      // Stash lastTargetListId directly on function to skip redundant writes
      if ((processDragOver as any).lastTargetListId === targetListId) {
        return;
      }
      (processDragOver as any).lastTargetListId = targetListId;
      setHoverTargetListId(targetListId);

      console.log('🔄 onDragOver - hovering list:', targetListId);

      // For cross-list movements, update cache optimistically to show preview
      if (originalListId !== targetListId) {
        console.log('👁️ Creating visual preview for cross-list movement');
        // The actual visual preview is handled by @dnd-kit's DragOverlay
        // and the drop indicator in task cards
      }
    }
  }

  /**
   * Handle column reordering
   */
  async function handleColumnReorder(
    activeColumn: TaskList,
    overColumn: TaskList
  ) {
    console.log('🔄 Reordering columns:', {
      activeId: activeColumn.id,
      overId: overColumn.id,
    });

    // Find the positions in the sorted array (create shallow copy to avoid mutating props)
    const sortedColumns = [...columns].sort((a, b) => {
      const statusA =
        STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 999;
      const statusB =
        STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 999;
      if (statusA !== statusB) return statusA - statusB;
      return a.position - b.position;
    });

    const activeIndex = sortedColumns.findIndex(
      (col) => col.id === activeColumn.id
    );
    const overIndex = sortedColumns.findIndex(
      (col) => col.id === overColumn.id
    );

    if (activeIndex !== -1 && overIndex !== -1) {
      // Optimistically reorder in cache
      const reorderedColumns = [...sortedColumns];
      const [movedColumn] = reorderedColumns.splice(activeIndex, 1);
      if (movedColumn) {
        reorderedColumns.splice(overIndex, 0, movedColumn);

        // Store snapshot for rollback
        const previousLists = queryClient.getQueryData<TaskList[]>([
          'task_lists',
          boardId,
        ]);

        // Update positions for all affected columns
        const updates = reorderedColumns.map((col, index) => ({
          listId: col.id,
          newPosition: index,
        }));

        // Update cache optimistically (no invalidation)
        queryClient.setQueryData(
          ['task_lists', boardId],
          (oldData: TaskList[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map((list) => {
              const update = updates.find((u) => u.listId === list.id);
              return update ? { ...list, position: update.newPosition } : list;
            });
          }
        );

        // Persist to database in background
        Promise.allSettled(
          updates.map((update) => moveListMutation.mutateAsync(update))
        ).then((results) => {
          const hasErrors = results.some((r) => r.status === 'rejected');
          if (hasErrors) {
            // Rollback on any error
            console.error('Failed to persist column reordering');
            if (previousLists) {
              queryClient.setQueryData(['task_lists', boardId], previousLists);
            } else {
              queryClient.invalidateQueries({
                queryKey: ['task_lists', boardId],
              });
            }
          }
        });
      }
    }
  }

  /**
   * Handle single task reorder/move
   */
  async function handleSingleTaskMove(
    activeTask: Task,
    targetListId: string,
    newSortKey: number
  ) {
    console.log(
      '📤 Reordering single task:',
      activeTask.id,
      'to position with sort_key:',
      newSortKey
    );

    try {
      await reorderTaskMutation.mutateAsync({
        taskId: activeTask.id,
        newListId: targetListId,
        newSortKey,
      });
    } catch (error) {
      console.error('Failed to reorder task:', error);
      // Optimistic update has already been rolled back by React Query's onError
    }
  }

  /**
   * Handle multi-select batch move
   */
  async function handleBatchTaskMove(
    _: Task,
    targetListId: string,
    overType: string,
    overId: string,
    targetListTasks: Task[]
  ) {
    console.log(
      '📤 Batch moving tasks:',
      Array.from(selectedTasks),
      'to',
      targetListId
    );

    // For batch moves, preserve visual order by sorting selected tasks by their current sort_key
    const selectedTaskIds = Array.from(selectedTasks);

    // Map task IDs to their current task objects
    const selectedTaskObjects = selectedTaskIds
      .map((taskId) => tasks.find((t) => t.id === taskId))
      .filter((t): t is Task => t !== undefined);

    // Sort by current sort_key (ascending) to preserve visual order
    const sortedTasksToMove = selectedTaskObjects.sort((a, b) => {
      const sortA = a.sort_key ?? MAX_SAFE_INTEGER_SORT;
      const sortB = b.sort_key ?? MAX_SAFE_INTEGER_SORT;
      if (sortA !== sortB) return sortA - sortB;
      if (a.created_at && b.created_at) {
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      return 0;
    });

    // Calculate sort keys for batch move by inserting as contiguous block
    // Get tasks in target list excluding the tasks being moved
    const targetListTasksExcludingMoved = targetListTasks.filter(
      (t) => !selectedTasks.has(t.id)
    );

    // Find the insertion point index based on where the dragged task was dropped
    let insertionIndex: number;
    if (overType === 'Task') {
      // When dropping on a task, find its position in the filtered list
      const overTaskInFiltered = targetListTasksExcludingMoved.findIndex(
        (t) => t.id === overId
      );

      if (overTaskInFiltered === -1) {
        // The over task is one of the selected tasks being moved
        // This means we're dropping on a task that's part of the selection
        // In this case, insert at the end since the drop position is ambiguous
        insertionIndex = targetListTasksExcludingMoved.length;
        console.log(
          '📍 Batch move: dropping on selected task, inserting at end'
        );
      } else {
        // Insert before the over task in the filtered list
        insertionIndex = overTaskInFiltered;
        console.log(
          '📍 Batch move: inserting before task at position',
          overTaskInFiltered
        );
      }
    } else {
      // Dropped on column/surface - add to end
      insertionIndex = targetListTasksExcludingMoved.length;
      console.log(
        '📍 Batch move: dropping on column surface, inserting at end'
      );
    }

    console.log('📍 Batch insertion index:', insertionIndex);
    console.log(
      '📍 Tasks in target (excluding moved):',
      targetListTasksExcludingMoved.length
    );

    // Calculate sort keys for each task in the batch
    // Build a simulated target list with tasks inserted to calculate proper sort keys
    const simulatedTargetList: Task[] = [
      ...targetListTasksExcludingMoved.slice(0, insertionIndex),
      ...sortedTasksToMove,
      ...targetListTasksExcludingMoved.slice(insertionIndex),
    ];

    console.log(
      '📍 Simulated target list:',
      simulatedTargetList.map((t, i) => `${i}: ${t.name}`)
    );

    // Process batch move with proper error handling
    for (const task of sortedTasksToMove) {
      let batchSortKey: number;

      // Find the task's position in the simulated list
      const positionInSimulated = simulatedTargetList.findIndex(
        (t) => t.id === task.id
      );

      if (simulatedTargetList.length === 1) {
        // Only task in list - use default from calculateSortKey
        batchSortKey = await calculateSortKeyWithRetry(
          null,
          null,
          targetListId
        );
      } else if (positionInSimulated === 0) {
        // At beginning - calculate based on next task
        const nextTask = simulatedTargetList[1];
        batchSortKey = await calculateSortKeyWithRetry(
          null,
          nextTask?.sort_key ?? null,
          targetListId
        );
      } else if (positionInSimulated === simulatedTargetList.length - 1) {
        // At end - calculate based on prev task
        const prevTask = simulatedTargetList[positionInSimulated - 1];
        batchSortKey = await calculateSortKeyWithRetry(
          prevTask?.sort_key ?? null,
          null,
          targetListId
        );
      } else {
        // In middle - use actual neighbors
        const prevTask = simulatedTargetList[positionInSimulated - 1];
        const nextTask = simulatedTargetList[positionInSimulated + 1];

        // Calculate based on neighbors
        const prevIsMoving = prevTask ? selectedTasks.has(prevTask.id) : false;
        const nextIsMoving = nextTask ? selectedTasks.has(nextTask.id) : false;

        if (!prevIsMoving && !nextIsMoving) {
          // Both neighbors are stationary - use their sort keys
          batchSortKey = await calculateSortKeyWithRetry(
            prevTask?.sort_key ?? null,
            nextTask?.sort_key ?? null,
            targetListId
          );
        } else if (prevIsMoving && !nextIsMoving) {
          // Prev is moving, next is stationary
          // Find the first non-moving task before this position
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
            targetListId
          );
        } else if (!prevIsMoving && nextIsMoving) {
          // Prev is stationary, next is moving
          // Find the first non-moving task after this position
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
            targetListId
          );
        } else {
          // Both neighbors are moving - find boundary tasks
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

          // Use calculateSortKey with boundaries
          batchSortKey = await calculateSortKeyWithRetry(
            boundaryPrev?.sort_key ?? null,
            boundaryNext?.sort_key ?? null,
            targetListId
          );
        }
      }

      reorderTaskMutation.mutate({
        taskId: task.id,
        newListId: targetListId,
        newSortKey: batchSortKey,
      });
    }

    // Clear selection after batch move
    clearSelection();
  }

  /**
   * Calculate new sort key for a task being dropped
   */
  async function calculateNewSortKey(
    activeTask: Task,
    targetListId: string,
    originalListId: string,
    overType: string,
    activeId: string,
    overId: string,
    targetListTasks: Task[]
  ): Promise<number> {
    // Calculate new sort_key based on drop location
    let newSortKey: number;

    if (overType === 'Task') {
      // Dropping on or near another task - use arrayMove to match @dnd-kit's visual preview
      const activeIndex = targetListTasks.findIndex((t) => t.id === activeId);
      const overIndex = targetListTasks.findIndex((t) => t.id === overId);

      console.log('📍 Active task index in target list:', activeIndex);
      console.log('📍 Over task index in target list:', overIndex);

      let reorderedTasks: Task[];
      const isSameList = originalListId === targetListId;

      if (isSameList && activeIndex !== -1) {
        // Guard: Skip reordering if dropping on same position
        if (activeIndex === overIndex) {
          console.log(
            '📍 Same-list same-index drop detected, skipping reorder'
          );
          reorderedTasks = targetListTasks;
        } else {
          // Same list reorder - use arrayMove
          reorderedTasks = arrayMove(targetListTasks, activeIndex, overIndex);
          console.log('📍 Same-list reorder using arrayMove');
        }
      } else {
        // Cross-list move - simulate arrayMove behavior for visual consistency
        // @dnd-kit shows the task at the overIndex position when dragging
        // We need to match this exactly

        // Step 1: Create a simulated array WITH the active task inserted at the OVER position
        // This matches what @dnd-kit shows visually
        const tasksWithoutActive = targetListTasks.filter(
          (t) => t.id !== activeTask.id
        );

        // Find where the over task is in the target list
        const overTaskIndex = tasksWithoutActive.findIndex(
          (t) => t.id === overId
        );

        if (overTaskIndex === -1) {
          // Over task not found (shouldn't happen), append to end
          reorderedTasks = [...tasksWithoutActive, activeTask];
          console.log(
            '📍 Cross-list move, over task not found, appending to end'
          );
        } else {
          // Insert BEFORE the over task to match @dnd-kit's visual preview
          // When you drag over a task, @dnd-kit places your task BEFORE it
          reorderedTasks = [
            ...tasksWithoutActive.slice(0, overTaskIndex),
            activeTask,
            ...tasksWithoutActive.slice(overTaskIndex),
          ];
          console.log(
            '📍 Cross-list move, inserting BEFORE task at index:',
            overTaskIndex
          );
        }
      }

      // Find the new position of the active task in the reordered array
      const newIndex = reorderedTasks.findIndex((t) => t.id === activeTask.id);

      console.log('📍 New index after reorder:', newIndex);
      console.log(
        '📍 Reordered tasks:',
        reorderedTasks.map((t, i) => `${i}: ${t.name}`)
      );

      // Calculate sort_key based on neighbors in the reordered array
      if (reorderedTasks.length === 1) {
        // Only task in the list - use default from calculateSortKey
        newSortKey = await calculateSortKeyWithRetry(null, null, targetListId);
      } else if (newIndex === 0) {
        // At beginning - next task is at index 1
        const nextTask = reorderedTasks[1];
        newSortKey = await calculateSortKeyWithRetry(
          null,
          nextTask?.sort_key ?? null,
          targetListId
        );
      } else if (newIndex === reorderedTasks.length - 1) {
        // At end - prev task is at index length-2
        const prevTask = reorderedTasks[reorderedTasks.length - 2];
        newSortKey = await calculateSortKeyWithRetry(
          prevTask?.sort_key ?? null,
          null,
          targetListId
        );
      } else {
        // In middle - use the actual prev and next tasks
        const prevTask = reorderedTasks[newIndex - 1];
        const nextTask = reorderedTasks[newIndex + 1];
        newSortKey = await calculateSortKeyWithRetry(
          prevTask?.sort_key ?? null,
          nextTask?.sort_key ?? null,
          targetListId
        );
      }
    } else {
      // Dropped on column or column surface
      // When dropping on Column (the column header), insert at the BEGINNING
      // When dropping on ColumnSurface (empty space in column), insert at the END

      if (targetListTasks.length === 0) {
        newSortKey = await calculateSortKeyWithRetry(null, null, targetListId);
      } else if (overType === 'Column') {
        // Dropping on column header - insert at the BEGINNING
        const firstTask = targetListTasks[0];
        newSortKey = await calculateSortKeyWithRetry(
          null,
          firstTask?.sort_key ?? null,
          targetListId
        );
      } else {
        // Dropping on ColumnSurface - add to the END
        const lastTask = targetListTasks[targetListTasks.length - 1];
        newSortKey = await calculateSortKeyWithRetry(
          lastTask?.sort_key ?? null,
          null,
          targetListId
        );
      }
    }

    return newSortKey;
  }

  /**
   * Handle drag end - execute the move/reorder
   */
  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    console.log('🔄 onDragEnd triggered');
    console.log('📦 Active:', active);
    console.log('🎯 Over:', over);

    // Store the original list ID before resetting drag state
    const originalListId = pickedUpTaskColumn.current;

    if (!over) {
      console.log('❌ No drop target detected, resetting state.');
      resetDragState();
      return;
    }

    const activeType = active.data?.current?.type;
    console.log('🏷️ Active type:', activeType);

    if (!activeType) {
      console.log('❌ No activeType, state reset.');
      resetDragState();
      return;
    }

    // Handle column reordering
    if (activeType === 'Column') {
      const activeColumn = active.data?.current?.column;
      const overColumn = over.data?.current?.column;

      if (activeColumn && overColumn && activeColumn.id !== overColumn.id) {
        await handleColumnReorder(activeColumn, overColumn);
      }
      resetDragState();
      return;
    }

    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      console.log('📋 Active task:', activeTask);

      if (!activeTask) {
        console.log('❌ No activeTask, state reset.');
        resetDragState();
        return;
      }

      let targetListId: string;
      const overType = over.data?.current?.type;
      console.log('🎯 Over type:', overType);

      if (overType === 'Column') {
        targetListId = String(over.id);
        console.log('📋 Dropping on column, targetListId:', targetListId);
      } else if (overType === 'Task') {
        // When dropping on a task, use the list_id of the target task
        const targetTask = over.data?.current?.task;
        if (!targetTask) {
          console.log('❌ No target task data, state reset.');
          resetDragState();
          return;
        }
        targetListId = String(targetTask.list_id);
        console.log('📋 Dropping on task, targetListId:', targetListId);
        console.log('📋 Target task details:', targetTask);
      } else if (overType === 'ColumnSurface') {
        const columnId = over.data?.current?.columnId || over.id;
        if (!columnId) {
          console.log('❌ No column surface id, state reset.');
          resetDragState();
          return;
        }
        targetListId = String(columnId);
        console.log(
          '📋 Dropping on column surface, targetListId:',
          targetListId
        );
      } else {
        console.log('❌ Invalid drop type:', overType, 'state reset.');
        resetDragState();
        return;
      }

      // Use the stored original list ID from drag start
      console.log('🏠 Original list ID (from drag start):', originalListId);
      console.log('🎯 Target list ID:', targetListId);
      console.log(
        '📋 Active task full data:',
        event.active.data?.current?.task
      );

      if (!originalListId) {
        console.log('❌ No originalListId, state reset.');
        resetDragState();
        return;
      }

      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );

      console.log('🔍 Source list exists:', sourceListExists);
      console.log('🔍 Target list exists:', targetListExists);
      console.log(
        '📊 Available columns:',
        columns.map((col) => ({ id: col.id, name: col.name }))
      );
      console.log(
        '📋 Tasks in source list:',
        tasks
          .filter((t) => t.list_id === originalListId)
          .map((t) => ({ id: t.id, name: t.name }))
      );
      console.log(
        '📋 Tasks in target list:',
        tasks
          .filter((t) => t.list_id === targetListId)
          .map((t) => ({ id: t.id, name: t.name }))
      );

      if (!sourceListExists || !targetListExists) {
        console.log('❌ Source or target list missing, state reset.');
        resetDragState();
        return;
      }

      // Calculate target position based on drop location
      // Get all tasks in the target list (INCLUDE the dragged task if it's in the same list)
      let targetListTasks = tasks.filter((t) => t.list_id === targetListId);

      // Only sort by sort_key if parent hasn't already sorted (match rendering behavior)
      if (!disableSort) {
        targetListTasks = targetListTasks.sort((a, b) => {
          // Use MAX_SAFE_INTEGER for null sort_key to match rendering behavior
          const sortA = a.sort_key ?? MAX_SAFE_INTEGER_SORT;
          const sortB = b.sort_key ?? MAX_SAFE_INTEGER_SORT;
          if (sortA !== sortB) return sortA - sortB;
          if (a.created_at && b.created_at) {
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          }
          return 0;
        });
      }

      console.log('📋 Sorted tasks in target list:', targetListTasks.length);
      console.log(
        '📋 Task IDs in order:',
        targetListTasks.map((t) => t.id)
      );

      // Calculate new sort_key based on drop location
      let newSortKey: number;

      try {
        newSortKey = await calculateNewSortKey(
          activeTask,
          targetListId,
          originalListId,
          overType,
          String(active.id),
          String(over.id),
          targetListTasks
        );
      } catch (error) {
        console.error('Failed to calculate sort key:', error);
        resetDragState();
        return;
      }

      console.log('🔢 Calculated sort_key:', newSortKey);

      // Check if we need to move/reorder
      const needsUpdate =
        targetListId !== originalListId || // Moving to different list
        (activeTask.sort_key ?? MAX_SAFE_INTEGER_SORT) !== newSortKey; // Position changed (strict integer comparison)

      if (needsUpdate) {
        console.log('✅ Task needs reordering');

        // Check if this is a multi-select drag
        if (isMultiSelectMode && selectedTasks.size > 1) {
          try {
            await handleBatchTaskMove(
              activeTask,
              targetListId,
              overType,
              String(over.id),
              targetListTasks
            );
          } catch (error) {
            console.error(
              'Failed to calculate sort keys for batch move:',
              error
            );
            resetDragState();
            return;
          }
        } else {
          await handleSingleTaskMove(activeTask, targetListId, newSortKey);
        }

        // Reset drag state AFTER mutation is called (so optimistic update happens first)
        requestAnimationFrame(() => {
          resetDragState();
        });
      } else {
        console.log('ℹ️ Task position unchanged, no update needed');
        resetDragState();
      }
    }

    // Reset drag state for column reorders
    if (activeType === 'Column') {
      resetDragState();
    }
  }

  return {
    onDragStart,
    onDragEnd,
    processDragOver,
    resetDragState,
  };
}
