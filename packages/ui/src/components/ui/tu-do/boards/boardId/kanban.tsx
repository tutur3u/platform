'use client';

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
} from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Box,
  Check,
  Flag,
  MinusCircle,
  Plus,
  Tags,
  Timer,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { coordinateGetter } from '@tuturuuu/utils/keyboard-preset';
import {
  useBoardConfig,
  useMoveTaskToBoard,
  useReorderTask,
} from '@tuturuuu/utils/task-helper';
import { hasDraggableData } from '@tuturuuu/utils/task-helpers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { TaskViewerProvider } from '../../providers/task-viewer-provider';
import type { ListStatusFilter } from '../../shared/board-header';
import CursorOverlayMultiWrapper from '../../shared/cursor-overlay-multi-wrapper';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '../../shared/estimation-mapping';
import { BoardSelector } from '../board-selector';
import { BoardColumn } from './board-column';
import { useBulkOperations } from './kanban-bulk-operations';
import {
  DRAG_ACTIVATION_DISTANCE,
  MAX_SAFE_INTEGER_SORT,
  MOBILE_BREAKPOINT,
} from './kanban-constants';
import { calculateSortKeyWithRetry as createCalculateSortKeyWithRetry } from './kanban-sort-helpers';
import { TaskCard } from './task';
import type { TaskFilters } from './task-filter';
import { TaskListForm } from './task-list-form';

interface Props {
  workspace: Workspace;
  boardId: string | null;
  tasks: Task[];
  lists: TaskList[];
  isLoading: boolean;
  disableSort?: boolean; // When true, skip internal sort_key sorting (parent already sorted)
  listStatusFilter?: ListStatusFilter;
  filters?: TaskFilters;
}

export function KanbanBoard({
  workspace,
  boardId,
  tasks,
  lists,
  isLoading,
  disableSort = false,
  listStatusFilter = 'all',
  filters,
}: Props) {
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
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Refs for drag state
  const pickedUpTaskColumn = useRef<string | null>(null);
  const anchoredColumn = useRef<string | null>(null);
  const anchoredTask = useRef<string | null>(null);

  // Auto-scroll refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const queryClient = useQueryClient();
  const supabase = createClient();
  const moveTaskToBoardMutation = useMoveTaskToBoard(boardId ?? '');
  const reorderTaskMutation = useReorderTask(boardId ?? '');
  const { createTask } = useTaskDialog();

  // Use React Query hook for board config (shared cache)
  const { data: boardConfig } = useBoardConfig(boardId);

  // Move list mutation for reordering columns
  const moveListMutation = useMutation({
    mutationFn: async ({
      listId,
      newPosition,
    }: {
      listId: string;
      newPosition: number;
    }) => {
      const { error } = await supabase
        .from('task_lists')
        .update({ position: newPosition })
        .eq('id', listId);

      if (error) throw error;
      return { listId, newPosition };
    },
    onError: (error) => {
      console.error('Failed to reorder list:', error);
      toast.error('Failed to reorder list');
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
    },
  });

  const columns: TaskList[] = lists.map((list) => ({
    ...list,
    title: list.name, // Maintain backward compatibility for title property
  }));
  // Ref for the Kanban board container
  const boardRef = useRef<HTMLDivElement>(null);

  const handleUpdate = useCallback(() => {
    // Note: We intentionally do NOT invalidate queries here.
    // Optimistic updates handle immediate UI feedback, and realtime
    // subscription handles cross-user sync. Invalidating would cause
    // all tasks to flicker (disappear then reappear).
  }, []);

  // Clean up selectedTasks when tasks are deleted
  useEffect(() => {
    if (tasks) {
      const currentTaskIds = new Set(tasks.map((task) => task.id));
      setSelectedTasks((prev) => {
        const validSelectedTasks = new Set(
          [...prev].filter((taskId) => currentTaskIds.has(taskId))
        );
        return validSelectedTasks.size !== prev.size
          ? validSelectedTasks
          : prev;
      });
    }
  }, [tasks]);

  // Multi-select handlers
  const handleTaskSelect = useCallback(
    (taskId: string, event: React.MouseEvent) => {
      const isShiftPressed = event.shiftKey;

      if (isShiftPressed) {
        // Range toggle - toggle all tasks between anchor and current task
        if (anchoredTask.current) {
          const clickedTask = tasks.find((t) => t.id === taskId);
          if (clickedTask && clickedTask.list_id === anchoredColumn.current) {
            const columnTasks = tasks.filter(
              (t) => t.list_id === anchoredColumn.current
            );
            const anchorIndex = columnTasks.findIndex(
              (t) => t.id === anchoredTask.current
            );
            const clickedIndex = columnTasks.findIndex((t) => t.id === taskId);

            const minTaskIndex = Math.min(anchorIndex, clickedIndex);
            const maxTaskIndex = Math.max(anchorIndex, clickedIndex);
            const rangeTaskIds = columnTasks
              .slice(minTaskIndex, maxTaskIndex + 1)
              .map((t) => t.id);

            // Check if clicked task is already selected to determine action
            const isClickedSelected = selectedTasks.has(taskId);

            setSelectedTasks((prev) => {
              const newSet = new Set(prev);
              if (isClickedSelected) {
                // If clicked task is selected, deselect the entire range
                for (const id of rangeTaskIds) {
                  newSet.delete(id);
                }
              } else {
                // If clicked task is not selected, select the entire range
                for (const id of rangeTaskIds) {
                  newSet.add(id);
                }
              }
              return newSet;
            });
          } else {
            // Different column or task not found - start new selection
            setSelectedTasks(new Set([taskId]));

            const newTask = tasks.find((t) => t.id === taskId);
            if (newTask) {
              anchoredColumn.current = newTask.list_id;
            } else {
              anchoredColumn.current = null;
            }
          }
        } else {
          // No anchor - start new selection
          setSelectedTasks(new Set([taskId]));

          const newTask = tasks.find((t) => t.id === taskId);
          if (newTask) {
            anchoredColumn.current = newTask.list_id;
          } else {
            anchoredColumn.current = null;
          }
        }
      } else {
        // Toggle selection in multi-select mode
        setSelectedTasks((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(taskId)) {
            newSet.delete(taskId);
          } else {
            newSet.add(taskId);
          }
          return newSet;
        });

        const clickedTask = tasks.find((t) => t.id === taskId);
        if (clickedTask) {
          anchoredColumn.current = clickedTask.list_id;
        } else {
          anchoredColumn.current = null;
        }
      }

      // Update anchored taskId
      anchoredTask.current = taskId;
    },
    [tasks, selectedTasks]
  );

  const clearSelection = useCallback(() => {
    setSelectedTasks(new Set());
    setIsMultiSelectMode(false);
    anchoredTask.current = null;
    anchoredColumn.current = null;
  }, []);

  // Cross-board move handler
  const handleCrossBoardMove = useCallback(() => {
    if (selectedTasks.size > 0) {
      setBoardSelectorOpen(true);
    }
  }, [selectedTasks]);

  // Handle the actual cross-board move
  const handleBoardMove = useCallback(
    async (targetBoardId: string, targetListId: string) => {
      if (selectedTasks.size === 0) return;

      const tasksToMove = Array.from(selectedTasks);

      try {
        console.log('🚀 Starting batch cross-board move');
        console.log('📋 Tasks to move:', tasksToMove);
        console.log('🎯 Target board:', targetBoardId);
        console.log('📋 Target list:', targetListId);

        // Move tasks one by one to ensure triggers fire for each task
        let successCount = 0;
        for (const taskId of tasksToMove) {
          try {
            await moveTaskToBoardMutation.mutateAsync({
              taskId,
              newListId: targetListId,
              targetBoardId,
            });
            successCount++;
          } catch (error) {
            console.error(`Failed to move task ${taskId}:`, error);
          }
        }

        console.log(
          `✅ Batch cross-board move completed: ${successCount}/${tasksToMove.length} tasks moved`
        );

        // Clear selection and close dialog after moves
        clearSelection();
        setBoardSelectorOpen(false);
      } catch (error) {
        console.error('Failed to move tasks:', error);
        // Don't close the dialog on error so user can retry
      }
    },
    [selectedTasks, moveTaskToBoardMutation, clearSelection]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (event.key === 'Escape') {
        clearSelection();
      }

      // C to create a new task (in the first list)
      if (
        event.key.toLowerCase() === 'c' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey &&
        !isInputField
      ) {
        event.preventDefault();
        event.stopPropagation();
        // Open create dialog with the first list
        const firstList = columns[0];
        if (firstList && boardId) {
          createTask(boardId, firstList.id, columns, filters);
        }
      }

      // Ctrl/Cmd + M to move selected tasks to another board
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'm' &&
        selectedTasks.size > 0
      ) {
        event.preventDefault();
        event.stopPropagation();
        handleCrossBoardMove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    clearSelection,
    handleCrossBoardMove,
    selectedTasks,
    columns,
    boardId,
    createTask,
    filters,
  ]);

  const processDragOver = useCallback(
    (event: DragOverEvent) => {
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
        // Stash lastTargetListId directly on function to skip redundant writes
        if ((processDragOver as any).lastTargetListId === targetListId) {
          if (hoverTargetListId !== targetListId) {
            setHoverTargetListId(targetListId);
          }
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
    },
    [columns, hoverTargetListId]
  );

  // Global drag state reset on mouseup/touchend
  useEffect(() => {
    function handleGlobalPointerUp() {
      setActiveColumn(null);
      setActiveTask(null);
      setHoverTargetListId(null);
      setDragPreviewPosition(null);
      pickedUpTaskColumn.current = null;
      (processDragOver as any).lastTargetListId = null;
      isDraggingRef.current = false;
      if (autoScrollRafRef.current) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    }
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
    };
  }, [processDragOver]);

  // Auto-scroll functionality when dragging near edges
  useEffect(() => {
    const EDGE_THRESHOLD = 100; // Distance from edge to trigger scroll (px)
    const SCROLL_SPEED = 10; // Base scroll speed (px per frame)
    const MAX_SCROLL_SPEED = 30; // Maximum scroll speed (px per frame)

    let currentPointerX = 0;

    function handlePointerMove(event: PointerEvent) {
      currentPointerX = event.clientX;
    }

    function autoScroll() {
      if (!isDraggingRef.current || !scrollContainerRef.current) {
        autoScrollRafRef.current = null;
        return;
      }

      const container = scrollContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Calculate distance from edges
      const distanceFromLeft = currentPointerX - rect.left;
      const distanceFromRight = rect.right - currentPointerX;

      let scrollAmount = 0;

      // Scroll left when near left edge
      if (distanceFromLeft < EDGE_THRESHOLD && distanceFromLeft > 0) {
        const intensity = 1 - distanceFromLeft / EDGE_THRESHOLD;
        scrollAmount = -Math.min(
          SCROLL_SPEED + intensity * (MAX_SCROLL_SPEED - SCROLL_SPEED),
          MAX_SCROLL_SPEED
        );
      }
      // Scroll right when near right edge
      else if (distanceFromRight < EDGE_THRESHOLD && distanceFromRight > 0) {
        const intensity = 1 - distanceFromRight / EDGE_THRESHOLD;
        scrollAmount = Math.min(
          SCROLL_SPEED + intensity * (MAX_SCROLL_SPEED - SCROLL_SPEED),
          MAX_SCROLL_SPEED
        );
      }

      // Apply scroll if needed
      if (scrollAmount !== 0) {
        container.scrollLeft += scrollAmount;
      }

      // Continue the animation loop
      autoScrollRafRef.current = requestAnimationFrame(autoScroll);
    }

    // Start auto-scroll loop when dragging starts (triggered by isDraggingRef)
    window.addEventListener('pointermove', handlePointerMove);

    // Watch for drag start to initialize auto-scroll loop
    const startAutoScrollLoop = () => {
      if (isDraggingRef.current && !autoScrollRafRef.current) {
        autoScrollRafRef.current = requestAnimationFrame(autoScroll);
      }
    };

    // Poll for drag start (alternative: trigger from onDragStart)
    const pollInterval = setInterval(startAutoScrollLoop, 100);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      clearInterval(pollInterval);
      if (autoScrollRafRef.current) {
        cancelAnimationFrame(autoScrollRafRef.current);
      }
    };
  }, []);

  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);
  const estimationOptions = useMemo(() => {
    if (!boardConfig?.estimation_type) return [] as number[];
    // Always build full index list respecting extended flag; disabling for >5 handled in UI.
    return buildEstimationIndices({
      extended: boardConfig.extended_estimation,
      allowZero: boardConfig.allow_zero_estimates,
    });
  }, [
    boardConfig?.estimation_type,
    boardConfig?.extended_estimation,
    boardConfig?.allow_zero_estimates,
  ]);

  // Workspace labels for bulk operations
  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspace_task_labels', workspace.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_task_labels')
        .select('id, name, color, created_at, ws_id')
        .eq('ws_id', workspace.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        color: string;
        created_at: string;
        ws_id: string;
      }[];
    },
    staleTime: 30000,
    enabled: isMultiSelectMode && selectedTasks.size > 0,
  });

  // Workspace projects for bulk operations
  const { data: workspaceProjects = [] } = useQuery({
    queryKey: ['task_projects', workspace.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('task_projects')
        .select('id, name, status')
        .eq('ws_id', workspace.id)
        .eq('deleted', false)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: isMultiSelectMode && selectedTasks.size > 0,
  });

  // Create bulk operations using TanStack Query mutations hook
  const {
    bulkUpdatePriority,
    bulkUpdateEstimation,
    bulkUpdateDueDate,
    bulkMoveToStatus,
    bulkAddLabel,
    bulkRemoveLabel,
    bulkAddProject,
    bulkRemoveProject,
    bulkDeleteTasks,
  } = useBulkOperations({
    queryClient,
    supabase,
    boardId: boardId ?? '',
    selectedTasks,
    columns,
    workspaceLabels,
    workspaceProjects,
    setBulkWorking,
    clearSelection,
    setBulkDeleteOpen,
  });

  // Detect mobile to disable drag sensors
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // On mobile, use MouseSensor instead of PointerSensor to allow touch scrolling
  const sensors = useSensors(
    useSensor(isMobile ? MouseSensor : PointerSensor, {
      activationConstraint: {
        distance: DRAG_ACTIVATION_DISTANCE,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinateGetter,
    })
  );

  // Ref to store task heights - shared with task-list virtualization
  const taskHeightsRef = useRef<Map<string, number>>(new Map());

  // Capture drag start card left position
  function onDragStart(event: DragStartEvent) {
    if (!hasDraggableData(event.active)) return;
    const { active } = event;
    if (!active.data?.current) return;

    // Enable auto-scroll (will be picked up by the effect's polling)
    isDraggingRef.current = true;

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

  // rAF throttling for onDragOver to reduce cache churn
  const dragOverRaf = useRef<number | null>(null);
  const lastOverArgs = useRef<DragOverEvent | null>(null);

  function onDragOver(event: DragOverEvent) {
    lastOverArgs.current = event;
    if (dragOverRaf.current != null) return; // already queued
    dragOverRaf.current = requestAnimationFrame(() => {
      dragOverRaf.current = null;
      if (lastOverArgs.current) processDragOver(lastOverArgs.current);
    });
  }

  useEffect(() => {
    return () => {
      if (dragOverRaf.current) cancelAnimationFrame(dragOverRaf.current);
    };
  }, []);

  // Task overlay - show the actual task card while dragging
  const MemoizedTaskOverlay = useMemo(() => {
    if (!activeTask) return null;

    const taskList = columns.find(
      (col) => String(col.id) === String(activeTask.list_id)
    );

    const isMultiCardDrag =
      isMultiSelectMode &&
      selectedTasks.size > 1 &&
      selectedTasks.has(activeTask.id);

    return (
      <div className="relative">
        <TaskCard
          task={activeTask}
          taskList={taskList}
          boardId={boardId ?? ''}
          isOverlay
          onUpdate={handleUpdate}
          isPersonalWorkspace={workspace.personal}
        />
        {isMultiCardDrag && (
          <>
            {/* Stacked card effect - show up to 2 additional card shadows */}
            <div
              className="-z-10 pointer-events-none absolute top-1 left-1 h-full w-full rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/5 shadow-lg"
              style={{ transform: 'translateZ(-10px)' }}
            />
            {selectedTasks.size > 2 && (
              <div
                className="-z-20 pointer-events-none absolute top-2 left-2 h-full w-full rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/3 shadow-md"
                style={{ transform: 'translateZ(-20px)' }}
              />
            )}
            {/* Badge showing count */}
            <div className="-right-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-blue text-white shadow-lg ring-2 ring-background">
              <span className="font-bold text-xs">{selectedTasks.size}</span>
            </div>
          </>
        )}
      </div>
    );
  }, [
    activeTask,
    columns,
    boardId,
    handleUpdate,
    workspace.personal,
    isMultiSelectMode,
    selectedTasks,
  ]);

  const MemoizedColumnOverlay = useMemo(
    () =>
      activeColumn ? (
        <BoardColumn
          column={activeColumn}
          boardId={boardId ?? ''}
          tasks={tasks.filter((task) => task.list_id === activeColumn.id)}
          isOverlay
          isPersonalWorkspace={workspace.personal}
          onUpdate={handleUpdate}
        />
      ) : null,
    [activeColumn, tasks, boardId, workspace.personal, handleUpdate]
  );

  // Use the extracted calculateSortKeyWithRetry helper
  const calculateSortKeyWithRetry = useCallback(
    (
      prevSortKey: number | null | undefined,
      nextSortKey: number | null | undefined,
      listId: string,
      visualOrderTasks?: Pick<Task, 'id' | 'sort_key' | 'created_at'>[]
    ) =>
      createCalculateSortKeyWithRetry(
        supabase,
        prevSortKey,
        nextSortKey,
        listId,
        visualOrderTasks
      ),
    [supabase]
  );

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    console.log('🔄 onDragEnd triggered');
    console.log('📦 Active:', active);
    console.log('🎯 Over:', over);

    // Store the original list ID before resetting drag state
    const originalListId = pickedUpTaskColumn.current;

    if (!over) {
      console.log('❌ No drop target detected, resetting state.');
      // Reset drag state only on invalid drop
      setActiveColumn(null);
      setActiveTask(null);
      setHoverTargetListId(null);
      setDragPreviewPosition(null);
      pickedUpTaskColumn.current = null;
      (processDragOver as any).lastTargetListId = null;
      // Clear optimistic update tracking
      setOptimisticUpdateInProgress(new Set());
      return;
    }

    const activeType = active.data?.current?.type;
    console.log('🏷️ Active type:', activeType);

    if (!activeType) {
      console.log('❌ No activeType, state reset.');
      setActiveColumn(null);
      setActiveTask(null);
      setHoverTargetListId(null);
      setDragPreviewPosition(null);
      pickedUpTaskColumn.current = null;
      (processDragOver as any).lastTargetListId = null;
      setOptimisticUpdateInProgress(new Set());
      return;
    }

    // Handle column reordering
    if (activeType === 'Column') {
      const activeColumn = active.data?.current?.column;
      const overColumn = over.data?.current?.column;

      if (activeColumn && overColumn && activeColumn.id !== overColumn.id) {
        console.log('🔄 Reordering columns:', {
          activeId: activeColumn.id,
          overId: overColumn.id,
        });

        // Find the positions in the sorted array
        const sortedColumns = columns.sort((a, b) => {
          const statusOrder = {
            documents: 0,
            not_started: 1,
            active: 2,
            done: 3,
            closed: 4,
          };
          const statusA =
            statusOrder[a.status as keyof typeof statusOrder] ?? 999;
          const statusB =
            statusOrder[b.status as keyof typeof statusOrder] ?? 999;
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
                  return update
                    ? { ...list, position: update.newPosition }
                    : list;
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
                  queryClient.setQueryData(
                    ['task_lists', boardId],
                    previousLists
                  );
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
      return;
    }

    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      console.log('📋 Active task:', activeTask);

      if (!activeTask) {
        console.log('❌ No activeTask, state reset.');
        setActiveColumn(null);
        setActiveTask(null);
        setHoverTargetListId(null);
        setDragPreviewPosition(null);
        pickedUpTaskColumn.current = null;
        (processDragOver as any).lastTargetListId = null;
        setOptimisticUpdateInProgress(new Set());
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
          setActiveColumn(null);
          setActiveTask(null);
          setHoverTargetListId(null);
          setDragPreviewPosition(null);
          pickedUpTaskColumn.current = null;
          (processDragOver as any).lastTargetListId = null;
          setOptimisticUpdateInProgress(new Set());
          return;
        }
        targetListId = String(targetTask.list_id);
        console.log('📋 Dropping on task, targetListId:', targetListId);
        console.log('📋 Target task details:', targetTask);
      } else if (overType === 'ColumnSurface') {
        const columnId = over.data?.current?.columnId || over.id;
        if (!columnId) {
          console.log('❌ No column surface id, state reset.');
          setActiveColumn(null);
          setActiveTask(null);
          setHoverTargetListId(null);
          setDragPreviewPosition(null);
          pickedUpTaskColumn.current = null;
          (processDragOver as any).lastTargetListId = null;
          setOptimisticUpdateInProgress(new Set());
          return;
        }
        targetListId = String(columnId);
        console.log(
          '📋 Dropping on column surface, targetListId:',
          targetListId
        );
      } else {
        console.log('❌ Invalid drop type:', overType, 'state reset.');
        setActiveColumn(null);
        setActiveTask(null);
        setHoverTargetListId(null);
        setDragPreviewPosition(null);
        pickedUpTaskColumn.current = null;
        (processDragOver as any).lastTargetListId = null;
        setOptimisticUpdateInProgress(new Set());
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
        setActiveColumn(null);
        setActiveTask(null);
        setHoverTargetListId(null);
        setDragPreviewPosition(null);
        pickedUpTaskColumn.current = null;
        (processDragOver as any).lastTargetListId = null;
        setOptimisticUpdateInProgress(new Set());
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
        setActiveColumn(null);
        setActiveTask(null);
        setHoverTargetListId(null);
        setDragPreviewPosition(null);
        pickedUpTaskColumn.current = null;
        (processDragOver as any).lastTargetListId = null;
        setOptimisticUpdateInProgress(new Set());
        return;
      }

      // Calculate target position based on drop location
      // Get all tasks in the target list (INCLUDE the dragged task if it's in the same list)
      let targetListTasks = tasks.filter((t) => t.list_id === targetListId);

      // Find the target list to check its status
      const targetList = columns.find((col) => String(col.id) === targetListId);

      // IMPORTANT: For "done" and "closed" lists, always place at first position (top)
      // These lists are sorted by completed_at/closed_at timestamps (most recent first)
      // The server auto-updates these timestamps, so new tasks will appear at top after DB update
      const isCompletionList =
        targetList?.status === 'done' || targetList?.status === 'closed';

      // Sort tasks - done/closed lists ALWAYS sort by timestamps only, others respect disableSort
      targetListTasks = targetListTasks.sort((a, b) => {
        // For done lists, ONLY sort by completed_at (most recent first) - no fallback to sort_key
        if (targetList?.status === 'done') {
          const completionA = a.completed_at
            ? new Date(a.completed_at).getTime()
            : 0;
          const completionB = b.completed_at
            ? new Date(b.completed_at).getTime()
            : 0;
          return completionB - completionA; // Always return, never fall through
        }

        // For closed lists, ONLY sort by closed_at (most recent first) - no fallback to sort_key
        if (targetList?.status === 'closed') {
          const closedA = a.closed_at ? new Date(a.closed_at).getTime() : 0;
          const closedB = b.closed_at ? new Date(b.closed_at).getTime() : 0;
          return closedB - closedA; // Always return, never fall through
        }

        // For all other lists, only sort by sort_key if parent hasn't already sorted
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

      console.log('📋 Sorted tasks in target list:', targetListTasks.length);
      console.log(
        '📋 Task IDs in order:',
        targetListTasks.map((t) => t.id)
      );

      // Calculate new sort_key based on drop location
      let newSortKey: number;

      // For completion lists (done/closed), ALWAYS place at position 0 (first/top)
      if (isCompletionList) {
        console.log(
          '📍 Dropping into completion list, forcing first position (top)'
        );

        try {
          if (targetListTasks.length === 0) {
            // Empty list - use default
            newSortKey = await calculateSortKeyWithRetry(
              null,
              null,
              targetListId,
              targetListTasks
            );
          } else {
            // Always place at beginning before first task
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
          // Reset drag state on error
          setActiveColumn(null);
          setActiveTask(null);
          setHoverTargetListId(null);
          setDragPreviewPosition(null);
          pickedUpTaskColumn.current = null;
          (processDragOver as any).lastTargetListId = null;
          setOptimisticUpdateInProgress(new Set());
          return;
        }
      } else if (overType === 'Task') {
        // Dropping on or near another task - use arrayMove to match @dnd-kit's visual preview
        const activeIndex = targetListTasks.findIndex(
          (t) => t.id === active.id
        );
        const overIndex = targetListTasks.findIndex((t) => t.id === over.id);

        console.log('📍 Active task index in target list:', activeIndex);
        console.log('📍 Over task index in target list:', overIndex);

        let reorderedTasks: Task[];
        const isSameList = originalListId === targetListId;

        if (isSameList && activeIndex !== -1) {
          // Same list reorder - use arrayMove
          reorderedTasks = arrayMove(targetListTasks, activeIndex, overIndex);
          console.log('📍 Same-list reorder using arrayMove');
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
            (t) => t.id === over.id
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
        const newIndex = reorderedTasks.findIndex(
          (t) => t.id === activeTask.id
        );

        console.log('📍 New index after reorder:', newIndex);
        console.log(
          '📍 Reordered tasks:',
          reorderedTasks.map((t, i) => `${i}: ${t.name}`)
        );

        // Calculate sort_key based on neighbors in the reordered array
        try {
          if (reorderedTasks.length === 1) {
            // Only task in the list - use default from calculateSortKey
            newSortKey = await calculateSortKeyWithRetry(
              null,
              null,
              targetListId,
              targetListTasks
            );
          } else if (newIndex === 0) {
            // At beginning - next task is at index 1
            const nextTask = reorderedTasks[1];
            newSortKey = await calculateSortKeyWithRetry(
              null,
              nextTask?.sort_key ?? null,
              targetListId,
              targetListTasks
            );
          } else if (newIndex === reorderedTasks.length - 1) {
            // At end - prev task is at index length-2
            const prevTask = reorderedTasks[reorderedTasks.length - 2];
            newSortKey = await calculateSortKeyWithRetry(
              prevTask?.sort_key ?? null,
              null,
              targetListId,
              targetListTasks
            );
          } else {
            // In middle - use the actual prev and next tasks
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
          // Reset drag state on error
          setActiveColumn(null);
          setActiveTask(null);
          setHoverTargetListId(null);
          setDragPreviewPosition(null);
          pickedUpTaskColumn.current = null;
          (processDragOver as any).lastTargetListId = null;
          setOptimisticUpdateInProgress(new Set());
          return;
        }
      } else {
        // Dropped on column or column surface
        // When dropping on Column (the column header), insert at the BEGINNING
        // When dropping on ColumnSurface (empty space in column), insert at the END

        try {
          if (targetListTasks.length === 0) {
            newSortKey = await calculateSortKeyWithRetry(
              null,
              null,
              targetListId,
              targetListTasks
            );
          } else if (overType === 'Column') {
            // Dropping on column header - insert at the BEGINNING
            const firstTask = targetListTasks[0];
            newSortKey = await calculateSortKeyWithRetry(
              null,
              firstTask?.sort_key ?? null,
              targetListId,
              targetListTasks
            );
          } else {
            // Dropping on ColumnSurface - add to the END
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
          // Reset drag state on error
          setActiveColumn(null);
          setActiveTask(null);
          setHoverTargetListId(null);
          setDragPreviewPosition(null);
          pickedUpTaskColumn.current = null;
          (processDragOver as any).lastTargetListId = null;
          setOptimisticUpdateInProgress(new Set());
          return;
        }
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
            if (!a.created_at || !b.created_at) return 0;
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          });

          // Calculate sort keys for batch move by inserting as contiguous block
          // Get tasks in target list excluding the tasks being moved
          const targetListTasksExcludingMoved = targetListTasks.filter(
            (t) => !selectedTasks.has(t.id)
          );

          // Find the insertion point index based on where the dragged task was dropped
          // IMPORTANT: For completion lists (done/closed), always insert at position 0 (top)
          let insertionIndex: number;
          if (isCompletionList) {
            // Always place at top for completion lists
            insertionIndex = 0;
            console.log(
              '📍 Batch move to completion list: inserting at beginning'
            );
          } else if (overType === 'Task') {
            // When dropping on a task, find its position in the filtered list
            const overTaskInFiltered = targetListTasksExcludingMoved.findIndex(
              (t) => t.id === over.id
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
          try {
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
                  targetListId,
                  targetListTasks
                );
              } else if (positionInSimulated === 0) {
                // At beginning - calculate based on next task
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
                // At end - calculate based on prev task
                const prevTask = simulatedTargetList[positionInSimulated - 1];
                batchSortKey = await calculateSortKeyWithRetry(
                  prevTask?.sort_key ?? null,
                  null,
                  targetListId,
                  targetListTasks
                );
              } else {
                // In middle - use actual neighbors
                const prevTask = simulatedTargetList[positionInSimulated - 1];
                const nextTask = simulatedTargetList[positionInSimulated + 1];

                // Calculate based on neighbors
                const prevIsMoving = prevTask
                  ? selectedTasks.has(prevTask.id)
                  : false;
                const nextIsMoving = nextTask
                  ? selectedTasks.has(nextTask.id)
                  : false;

                if (!prevIsMoving && !nextIsMoving) {
                  // Both neighbors are stationary - use their sort keys
                  batchSortKey = await calculateSortKeyWithRetry(
                    prevTask?.sort_key ?? null,
                    nextTask?.sort_key ?? null,
                    targetListId,
                    targetListTasks
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
                    targetListId,
                    targetListTasks
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
                    targetListId,
                    targetListTasks
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
                    targetListId,
                    targetListTasks
                  );
                }
              }

              reorderTaskMutation.mutate({
                taskId: task.id,
                newListId: targetListId,
                newSortKey: batchSortKey,
              });
            }
          } catch (error) {
            console.error(
              'Failed to calculate sort keys for batch move:',
              error
            );
            // Reset drag state on error
            setActiveColumn(null);
            setActiveTask(null);
            setHoverTargetListId(null);
            setDragPreviewPosition(null);
            pickedUpTaskColumn.current = null;
            (processDragOver as any).lastTargetListId = null;
            setOptimisticUpdateInProgress(new Set());
            return;
          }

          // Clear selection after batch move
          clearSelection();
        } else {
          console.log(
            '📤 Reordering single task:',
            activeTask.id,
            'to position with sort_key:',
            newSortKey
          );

          reorderTaskMutation.mutate({
            taskId: activeTask.id,
            newListId: targetListId,
            newSortKey,
          });
        }

        // Reset drag state AFTER mutation is called (so optimistic update happens first)
        requestAnimationFrame(() => {
          setActiveColumn(null);
          setActiveTask(null);
          setHoverTargetListId(null);
          setDragPreviewPosition(null);
          pickedUpTaskColumn.current = null;
          (processDragOver as any).lastTargetListId = null;
          // Clear optimistic update tracking immediately on drag end
          setOptimisticUpdateInProgress(new Set());
        });
      } else {
        console.log('ℹ️ Task position unchanged, no update needed');
        // Reset drag state since no update is needed
        setActiveColumn(null);
        setActiveTask(null);
        setHoverTargetListId(null);
        setDragPreviewPosition(null);
        pickedUpTaskColumn.current = null;
        (processDragOver as any).lastTargetListId = null;
        // Clear optimistic update tracking
        setOptimisticUpdateInProgress(new Set());
      }
    }

    // Reset drag state for column reorders
    if (activeType === 'Column') {
      setActiveColumn(null);
      setActiveTask(null);
      setHoverTargetListId(null);
      setDragPreviewPosition(null);
      pickedUpTaskColumn.current = null;
      (processDragOver as any).lastTargetListId = null;
      setOptimisticUpdateInProgress(new Set());
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        {/* Loading skeleton for search bar */}
        <Card className="mb-4 border-dynamic-blue/20 bg-dynamic-blue/5">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-md flex-1">
                <div className="h-9 w-full animate-pulse rounded-md bg-dynamic-blue/10"></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-16 animate-pulse rounded-md bg-dynamic-blue/10"></div>
                <div className="h-8 w-20 animate-pulse rounded-md bg-dynamic-blue/10"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading skeleton for kanban columns */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-4 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="h-full w-[350px] animate-pulse">
                <div className="p-4">
                  <div className="mb-4 h-6 w-32 rounded bg-gray-200"></div>
                  <div className="space-y-3">
                    {[1, 2, 3].map((j) => (
                      <div
                        key={j}
                        className="h-24 w-full rounded bg-gray-100"
                      ></div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Multi-select indicator */}
      {isMultiSelectMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-linear-to-r from-primary/5 via-primary/3 to-transparent px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
            <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 ring-1 ring-primary/20">
              <Check className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-primary">
                {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="hidden text-muted-foreground text-xs sm:inline">
              Click cards to toggle • Drag to move • Ctrl+M board move • Esc
              clear
            </span>
            {bulkWorking && (
              <Badge
                variant="outline"
                className="animate-pulse border-dynamic-blue/40 text-[10px]"
              >
                Working...
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={bulkWorking}
                >
                  <Tags className="mr-1 h-3 w-3" /> Bulk
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {boardConfig?.estimation_type && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Timer className="mr-2 h-3.5 w-3.5 text-dynamic-purple" />
                      Estimation
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-48">
                      <DropdownMenuItem
                        disabled={bulkWorking}
                        onClick={() => bulkUpdateEstimation(null)}
                      >
                        Clear
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {estimationOptions.map((p) => {
                        const disabledByExtended =
                          !boardConfig?.extended_estimation && p > 5;
                        return (
                          <DropdownMenuItem
                            key={p}
                            disabled={bulkWorking || disabledByExtended}
                            onClick={() => bulkUpdateEstimation(p)}
                          >
                            {mapEstimationPoints(
                              p,
                              boardConfig?.estimation_type
                            )}
                            {disabledByExtended && (
                              <span className="ml-1 text-[10px] text-muted-foreground/60">
                                (upgrade)
                              </span>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Flag className="mr-2 h-3.5 w-3.5 text-dynamic-green" />
                    Due Date
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('today')}
                    >
                      Today
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('tomorrow')}
                    >
                      Tomorrow
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('week')}
                    >
                      In 7 Days
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('clear')}
                    >
                      Clear
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Flag className="mr-2 h-3.5 w-3.5 text-dynamic-blue" />
                    Status
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <DropdownMenuItem
                      disabled={
                        bulkWorking || !columns.some((c) => c.status === 'done')
                      }
                      onClick={() => bulkMoveToStatus('done')}
                    >
                      Mark Done
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={
                        bulkWorking ||
                        !columns.some((c) => c.status === 'closed')
                      }
                      onClick={() => bulkMoveToStatus('closed')}
                    >
                      Mark Closed
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Flag className="mr-2 h-3.5 w-3.5 text-dynamic-orange" />
                    Priority
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority(null)}
                    >
                      Clear
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('critical')}
                    >
                      Critical
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('high')}
                    >
                      High
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('normal')}
                    >
                      Normal
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('low')}
                    >
                      Low
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Tags className="mr-2 h-3.5 w-3.5 text-dynamic-cyan" />
                    Add Label
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[400px] w-52 overflow-hidden p-0">
                    {workspaceLabels.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">
                        No labels
                      </div>
                    ) : (
                      <ScrollArea className="h-[min(300px,calc(100vh-200px))]">
                        <div className="p-1">
                          {workspaceLabels.map((l) => (
                            <DropdownMenuItem
                              key={l.id}
                              disabled={bulkWorking}
                              onClick={() => bulkAddLabel(l.id)}
                              className="flex items-center gap-2"
                            >
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{
                                  backgroundColor: l.color,
                                  opacity: 0.9,
                                }}
                              />
                              {l.name}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <MinusCircle className="mr-2 h-3.5 w-3.5 text-dynamic-red" />
                    Remove Label
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[400px] w-52 overflow-hidden p-0">
                    {workspaceLabels.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">
                        No labels
                      </div>
                    ) : (
                      <ScrollArea className="h-[min(300px,calc(100vh-200px))]">
                        <div className="p-1">
                          {workspaceLabels.map((l) => (
                            <DropdownMenuItem
                              key={l.id}
                              disabled={bulkWorking}
                              onClick={() => bulkRemoveLabel(l.id)}
                              className="flex items-center gap-2"
                            >
                              <span
                                className="h-3 w-3 rounded-full ring-1 ring-border"
                                style={{
                                  backgroundColor: l.color,
                                  opacity: 0.3,
                                }}
                              />
                              {l.name}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Plus className="mr-2 h-3.5 w-3.5 text-dynamic-indigo" />
                    Add Project
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[400px] w-52 overflow-hidden p-0">
                    {workspaceProjects.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">
                        No projects
                      </div>
                    ) : (
                      <ScrollArea className="h-[min(300px,calc(100vh-200px))]">
                        <div className="p-1">
                          {workspaceProjects.map((p: any) => (
                            <DropdownMenuItem
                              key={p.id}
                              disabled={bulkWorking}
                              onClick={() => bulkAddProject(p.id)}
                              className="flex items-center gap-2"
                            >
                              <Box className="h-3 w-3 text-dynamic-sky" />
                              {p.name}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <MinusCircle className="mr-2 h-3.5 w-3.5 text-dynamic-red" />
                    Remove Project
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[400px] w-52 overflow-hidden p-0">
                    {workspaceProjects.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">
                        No projects
                      </div>
                    ) : (
                      <ScrollArea className="h-[min(300px,calc(100vh-200px))]">
                        <div className="p-1">
                          {workspaceProjects.map((p: any) => (
                            <DropdownMenuItem
                              key={p.id}
                              disabled={bulkWorking}
                              onClick={() => bulkRemoveProject(p.id)}
                              className="flex items-center gap-2"
                            >
                              <Box className="h-3 w-3 text-muted-foreground opacity-50" />
                              {p.name}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setBulkDeleteOpen(true)}
                  className="text-dynamic-red focus:text-dynamic-red"
                  disabled={bulkWorking}
                >
                  Delete selected…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCrossBoardMove}
              className="h-6 px-2 text-xs"
              disabled={selectedTasks.size === 0 || bulkWorking}
            >
              <ArrowRightLeft className="mr-1 h-3 w-3" />
              Move
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-6 px-2 text-xs"
              disabled={bulkWorking}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end px-3 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMultiSelectMode(true)}
            className="px-2 text-muted-foreground hover:text-primary"
          >
            <Check className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm">Choose tasks</span>
          </Button>
        </div>
      )}

      {/* Kanban Board */}
      <TaskViewerProvider boardId={boardId ?? ''} enabled={!workspace.personal}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            measuring={{
              droppable: {
                strategy: MeasuringStrategy.Always,
              },
            }}
            autoScroll={false}
          >
            <div
              ref={scrollContainerRef}
              className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent relative flex h-full w-full gap-4 overflow-x-auto"
            >
              <SortableContext
                items={columnsId}
                strategy={horizontalListSortingStrategy}
              >
                <div ref={boardRef} className="flex h-full gap-4 p-2 md:px-4">
                  {[...columns]
                    .sort((a, b) => {
                      // First sort by status priority, then by position within status
                      const statusOrder = {
                        documents: 0,
                        not_started: 1,
                        active: 2,
                        done: 3,
                        closed: 4,
                      };
                      const statusA =
                        statusOrder[a.status as keyof typeof statusOrder] ??
                        999;
                      const statusB =
                        statusOrder[b.status as keyof typeof statusOrder] ??
                        999;
                      if (statusA !== statusB) return statusA - statusB;
                      return a.position - b.position;
                    })
                    .map((list) => {
                      // Filter tasks for this list
                      let listTasks = tasks.filter(
                        (task) => task.list_id === list.id
                      );

                      // Sort tasks - done/closed lists ALWAYS sort by timestamps only, others respect disableSort
                      listTasks = listTasks.sort((a, b) => {
                        // For done lists, ONLY sort by completed_at (most recent first) - no fallback to sort_key
                        if (list.status === 'done') {
                          const completionA = a.completed_at
                            ? new Date(a.completed_at).getTime()
                            : 0;
                          const completionB = b.completed_at
                            ? new Date(b.completed_at).getTime()
                            : 0;
                          return completionB - completionA; // Always return, never fall through
                        }

                        // For closed lists, ONLY sort by closed_at (most recent first) - no fallback to sort_key
                        if (list.status === 'closed') {
                          const closedA = a.closed_at
                            ? new Date(a.closed_at).getTime()
                            : 0;
                          const closedB = b.closed_at
                            ? new Date(b.closed_at).getTime()
                            : 0;
                          return closedB - closedA; // Always return, never fall through
                        }

                        // For all other lists, only sort by sort_key if parent hasn't already sorted
                        if (!disableSort) {
                          const sortA = a.sort_key ?? MAX_SAFE_INTEGER_SORT;
                          const sortB = b.sort_key ?? MAX_SAFE_INTEGER_SORT;
                          if (sortA !== sortB) return sortA - sortB;
                          if (!a.created_at || !b.created_at) return 0;
                          return (
                            new Date(a.created_at).getTime() -
                            new Date(b.created_at).getTime()
                          );
                        }

                        return 0;
                      });

                      return (
                        <BoardColumn
                          key={list.id}
                          column={list}
                          boardId={boardId ?? ''}
                          tasks={listTasks}
                          isPersonalWorkspace={workspace.personal}
                          onUpdate={handleUpdate}
                          onAddTask={() =>
                            boardId &&
                            createTask(boardId, list.id, columns, filters)
                          }
                          selectedTasks={selectedTasks}
                          isMultiSelectMode={isMultiSelectMode}
                          setIsMultiSelectMode={setIsMultiSelectMode}
                          onTaskSelect={handleTaskSelect}
                          onClearSelection={clearSelection}
                          dragPreviewPosition={
                            dragPreviewPosition?.listId === String(list.id)
                              ? dragPreviewPosition
                              : null
                          }
                          taskHeightsRef={taskHeightsRef}
                          optimisticUpdateInProgress={
                            optimisticUpdateInProgress
                          }
                          filters={filters}
                        />
                      );
                    })}
                  <TaskListForm
                    boardId={boardId ?? ''}
                    onListCreated={handleUpdate}
                  />
                </div>
              </SortableContext>

              {/* Overlay for collaborator cursors */}
              {!workspace.personal && boardId && (
                <CursorOverlayMultiWrapper
                  channelName={`board-cursor-${boardId}`}
                  containerRef={boardRef}
                  listStatusFilter={listStatusFilter}
                  filters={filters}
                />
              )}
            </div>
            <DragOverlay dropAnimation={null}>
              {MemoizedTaskOverlay || MemoizedColumnOverlay}
            </DragOverlay>
          </DndContext>
        </div>
      </TaskViewerProvider>

      {/* Board Selector Dialog */}
      <BoardSelector
        open={boardSelectorOpen}
        onOpenChange={setBoardSelectorOpen}
        wsId={workspace.id}
        currentBoardId={boardId ?? ''}
        taskCount={selectedTasks.size}
        onMove={handleBoardMove}
        isMoving={moveTaskToBoardMutation.isPending}
      />

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete selected tasks</DialogTitle>
            <DialogDescription>
              This action cannot be undone. It will permanently remove{' '}
              {selectedTasks.size} selected task
              {selectedTasks.size === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={bulkWorking}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={bulkDeleteTasks}
              disabled={bulkWorking}
            >
              {bulkWorking ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
