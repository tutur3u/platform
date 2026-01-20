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
  PointerSensor,
  TouchSensor,
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
  Calendar,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleFadingArrowUpIcon,
  CircleSlash,
  Flag,
  horseHead,
  Icon,
  List,
  MoreHorizontal,
  Move,
  Plus,
  Rabbit,
  Search,
  Tags,
  Timer,
  Trash2,
  Turtle,
  UserStar,
  unicornHead,
  X,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useWorkspaceMembers } from '@tuturuuu/ui/hooks/use-workspace-members';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { coordinateGetter } from '@tuturuuu/utils/keyboard-preset';
import {
  useBoardConfig,
  useMoveTaskToBoard,
  useReorderTask,
} from '@tuturuuu/utils/task-helper';
import { hasDraggableData } from '@tuturuuu/utils/task-helpers';
import { useTranslations } from 'next-intl';
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
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
}

// Bulk Custom Date Dialog Component
function BulkCustomDateDialog({
  open,
  onOpenChange,
  onDateChange,
  onClear,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDateChange: (date: Date | undefined) => void;
  onClear: () => void;
  isLoading: boolean;
}) {
  const t = useTranslations();
  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>
            {t('ws-task-boards.bulk.set_custom_due_date')}
          </DialogTitle>
          <DialogDescription>
            {t('ws-task-boards.bulk.set_custom_due_date_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <DateTimePicker
            date={undefined}
            setDate={onDateChange}
            showTimeSelect={true}
            minDate={new Date()}
            inline
            preferences={{ weekStartsOn, timezone, timeFormat }}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            {t('common.remove_due_date')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  isMultiSelectMode,
  setIsMultiSelectMode,
}: Props) {
  const t = useTranslations();
  const tc = useTranslations('common');
  const { modKey } = usePlatform();
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
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkCustomDateOpen, setBulkCustomDateOpen] = useState(false);
  const [labelSearchQuery, setLabelSearchQuery] = useState('');
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');

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
  const { weekStartsOn } = useCalendarPreferences();

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
  }, [setIsMultiSelectMode]);

  // Cross-board move handler
  const handleCrossBoardMove = useCallback(() => {
    if (selectedTasks.size > 0) {
      setBoardSelectorOpen(true);
    }
  }, [selectedTasks]);

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

  // Workspace members for bulk operations
  const { data: workspaceMembers = [] } = useWorkspaceMembers(workspace.id, {
    enabled:
      !!workspace.id &&
      !workspace.personal &&
      isMultiSelectMode &&
      selectedTasks.size > 0,
  });

  // Calculate which labels/projects/assignees are applied to ALL selected tasks
  // Compute directly from tasks cache to sync with optimistic updates and realtime
  const appliedLabels = useMemo(() => {
    if (selectedTasks.size === 0) return new Set<string>();
    const labelCounts = new Map<string, number>();

    // Get labels from selected tasks
    tasks.forEach((task) => {
      if (selectedTasks.has(task.id)) {
        task.labels?.forEach((label) => {
          labelCounts.set(label.id, (labelCounts.get(label.id) || 0) + 1);
        });
      }
    });

    // Return labels that appear on ALL selected tasks
    return new Set(
      Array.from(labelCounts.entries())
        .filter(([_, count]) => count === selectedTasks.size)
        .map(([labelId]) => labelId)
    );
  }, [tasks, selectedTasks]);

  const appliedProjects = useMemo(() => {
    if (selectedTasks.size === 0) return new Set<string>();
    const projectCounts = new Map<string, number>();

    // Get projects from selected tasks
    tasks.forEach((task) => {
      if (selectedTasks.has(task.id)) {
        task.projects?.forEach((project) => {
          projectCounts.set(
            project.id,
            (projectCounts.get(project.id) || 0) + 1
          );
        });
      }
    });

    // Return projects that appear on ALL selected tasks
    return new Set(
      Array.from(projectCounts.entries())
        .filter(([_, count]) => count === selectedTasks.size)
        .map(([projectId]) => projectId)
    );
  }, [tasks, selectedTasks]);

  const appliedAssignees = useMemo(() => {
    if (selectedTasks.size === 0) return new Set<string>();
    const assigneeCounts = new Map<string, number>();

    // Get assignees from selected tasks
    tasks.forEach((task) => {
      if (selectedTasks.has(task.id)) {
        task.assignees?.forEach((assignee) => {
          assigneeCounts.set(
            assignee.id,
            (assigneeCounts.get(assignee.id) || 0) + 1
          );
        });
      }
    });

    // Return assignees that appear on ALL selected tasks
    return new Set(
      Array.from(assigneeCounts.entries())
        .filter(([_, count]) => count === selectedTasks.size)
        .map(([userId]) => userId)
    );
  }, [tasks, selectedTasks]);

  // Filter labels and projects based on search
  const filteredLabels = useMemo(() => {
    return workspaceLabels.filter(
      (label) =>
        !labelSearchQuery ||
        label.name.toLowerCase().includes(labelSearchQuery.toLowerCase())
    );
  }, [workspaceLabels, labelSearchQuery]);

  const filteredProjects = useMemo(() => {
    return workspaceProjects.filter(
      (project: any) =>
        !projectSearchQuery ||
        project.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
    );
  }, [workspaceProjects, projectSearchQuery]);

  const filteredMembers = useMemo(() => {
    return workspaceMembers.filter(
      (member: any) =>
        !assigneeSearchQuery ||
        member.display_name
          ?.toLowerCase()
          .includes(assigneeSearchQuery.toLowerCase()) ||
        member.email?.toLowerCase().includes(assigneeSearchQuery.toLowerCase())
    );
  }, [workspaceMembers, assigneeSearchQuery]);

  // Create bulk operations using TanStack Query mutations hook
  const {
    bulkUpdatePriority,
    bulkUpdateEstimation,
    bulkUpdateDueDate,
    bulkUpdateCustomDueDate,
    bulkMoveToList,
    bulkMoveToStatus,
    bulkAddLabel,
    bulkRemoveLabel,
    bulkClearLabels,
    bulkAddProject,
    bulkRemoveProject,
    bulkClearProjects,
    bulkAddAssignee,
    bulkRemoveAssignee,
    bulkClearAssignees,
    bulkDeleteTasks,
  } = useBulkOperations({
    queryClient,
    supabase,
    boardId: boardId ?? '',
    selectedTasks,
    columns,
    workspaceLabels,
    workspaceProjects,
    weekStartsOn,
    setBulkWorking,
    clearSelection,
    setBulkDeleteOpen,
  });

  // Handle the actual cross-board move
  const handleBoardMove = useCallback(
    async (targetBoardId: string, targetListId: string) => {
      if (selectedTasks.size === 0) return;

      const tasksToMove = Array.from(selectedTasks);

      try {
        console.log('🚀 Starting sequential cross-board move');
        console.log('📋 Tasks to move:', tasksToMove);
        console.log('🎯 Target board:', targetBoardId);
        console.log('📋 Target list:', targetListId);

        // Move tasks one by one to ensure triggers fire for each task and provide granular feedback
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
          `✅ Sequential cross-board move completed: ${successCount}/${tasksToMove.length} tasks moved`
        );

        // Clear selection and close dialog after moves
        clearSelection();
        setBoardSelectorOpen(false);
      } catch (error) {
        console.error('Failed to move tasks:', error);
      }
    },
    [selectedTasks, moveTaskToBoardMutation, clearSelection]
  );

  // Keyboard shortcuts for multiselect mode (Shift for range select, Cmd/Ctrl for toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Only Shift key (without other modifiers) enables multiselect mode
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!isMultiSelectMode) {
          setIsMultiSelectMode(true);
        }
      }

      // Turn OFF if any forbidden modifier is pressed
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if (isMultiSelectMode) {
          setIsMultiSelectMode(false);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Exit multiselect mode when all modifier keys are released
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Only exit if we have no selected tasks
        if (isMultiSelectMode && selectedTasks.size === 0) {
          setIsMultiSelectMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMultiSelectMode, selectedTasks.size, setIsMultiSelectMode]);

  // Configure sensors for both mouse/pointer and touch interactions
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: DRAG_ACTIVATION_DISTANCE,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 500, // Require 500ms press-and-hold before drag starts
        tolerance: 5,
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
              className="pointer-events-none absolute top-1 left-1 -z-10 h-full w-full rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/5 shadow-lg"
              style={{ transform: 'translateZ(-10px)' }}
            />
            {selectedTasks.size > 2 && (
              <div
                className="pointer-events-none absolute top-2 left-2 -z-20 h-full w-full rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/3 shadow-md"
                style={{ transform: 'translateZ(-20px)' }}
              />
            )}
            {/* Badge showing count */}
            <div className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-blue text-white shadow-lg ring-2 ring-background">
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
          wsId={workspace.id}
        />
      ) : null,
    [
      activeColumn,
      tasks,
      boardId,
      workspace.personal,
      handleUpdate,
      workspace.id,
    ]
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
          const overTaskInFiltered = tasksWithoutActive.findIndex(
            (t) => t.id === over.id
          );

          if (overTaskInFiltered === -1) {
            // Over task not found (shouldn't happen), append to end
            reorderedTasks = [...tasksWithoutActive, activeTask];
            console.log(
              '📍 Cross-list move, over task not found, appending to end'
            );
          } else {
            // Insert BEFORE the over task to match @dnd-kit's visual preview
            // When you drag over a task, @dnd-kit places your task BEFORE it
            reorderedTasks = [
              ...tasksWithoutActive.slice(0, overTaskInFiltered),
              activeTask,
              ...tasksWithoutActive.slice(overTaskInFiltered),
            ];
            console.log(
              '📍 Cross-list move, inserting BEFORE task at index:',
              overTaskInFiltered
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
              <Card key={i} className="h-full w-87.5 animate-pulse">
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
      {isMultiSelectMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-linear-to-r from-primary/5 via-primary/3 to-transparent px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
            <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 ring-1 ring-primary/20">
              <Check className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-primary">
                {selectedTasks.size}{' '}
                {selectedTasks.size === 1 ? tc('task') : tc('tasks_plural')}
              </span>
            </div>
            <span className="hidden text-muted-foreground text-xs sm:inline">
              {tc('selection_instruction', { modKey })}
            </span>
            {bulkWorking && (
              <Badge
                variant="outline"
                className="animate-pulse border-dynamic-blue/40 text-[10px]"
              >
                {t('common.working')}
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
                  <MoreHorizontal className="mr-1 h-3 w-3" />{' '}
                  {t('common.bulk_actions')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56"
                sideOffset={5}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {/* Quick Completion Actions */}
                {columns.some((c) => c.status === 'done') && (
                  <DropdownMenuItem
                    disabled={bulkWorking}
                    onClick={() => bulkMoveToStatus('done')}
                    className="cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                    {t('common.mark_as_done')}
                  </DropdownMenuItem>
                )}
                {columns.some((c) => c.status === 'closed') && (
                  <DropdownMenuItem
                    disabled={bulkWorking}
                    onClick={() => bulkMoveToStatus('closed')}
                    className="cursor-pointer"
                  >
                    <CircleSlash className="h-4 w-4 text-dynamic-purple" />
                    {t('common.mark_as_closed')}
                  </DropdownMenuItem>
                )}
                {(columns.some((c) => c.status === 'done') ||
                  columns.some((c) => c.status === 'closed')) && (
                  <DropdownMenuSeparator />
                )}

                {/* Priority Menu - Matching TaskPriorityMenu exactly */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Flag className="h-4 w-4 text-dynamic-red" />
                    {t('common.priority')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('critical')}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-dynamic-red/10">
                          <Icon
                            iconNode={unicornHead}
                            className="h-3.5 w-3.5 text-dynamic-red"
                          />
                        </div>
                        <span>{t('tasks.priority_critical')}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('high')}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-dynamic-orange/10">
                          <Icon
                            iconNode={horseHead}
                            className="h-3.5 w-3.5 text-dynamic-orange"
                          />
                        </div>
                        <span>{t('tasks.priority_high')}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('normal')}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-dynamic-yellow/10">
                          <Rabbit className="h-3.5 w-3.5 text-dynamic-yellow" />
                        </div>
                        <span>{t('tasks.priority_normal')}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('low')}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-dynamic-blue/10">
                          <Turtle className="h-3.5 w-3.5 text-dynamic-blue" />
                        </div>
                        <span>{t('tasks.priority_low')}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority(null)}
                      className="cursor-pointer text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                      {t('tasks.priority_none')}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Due Date Menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <div className="h-4 w-4">
                      <Calendar className="h-4 w-4 text-dynamic-purple" />
                    </div>
                    <div className="flex w-full items-center justify-between">
                      <span>{tc('due_date')}</span>
                    </div>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('today')}
                      className="cursor-pointer"
                    >
                      <Calendar className="h-4 w-4 text-dynamic-green" />
                      {t('common.today')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('tomorrow')}
                      className="cursor-pointer"
                    >
                      <Calendar className="h-4 w-4 text-dynamic-blue" />
                      {t('common.tomorrow')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('this_week')}
                      className="cursor-pointer"
                    >
                      <Calendar className="h-4 w-4 text-dynamic-purple" />
                      {t('common.this_week')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('next_week')}
                      className="cursor-pointer"
                    >
                      <Calendar className="h-4 w-4 text-dynamic-orange" />
                      {t('common.next_week')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => setBulkCustomDateOpen(true)}
                      className="cursor-pointer"
                    >
                      <Calendar className="h-4 w-4" />
                      {t('ws-task-boards.bulk.set_custom_due_date')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('clear')}
                      className="cursor-pointer text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                      {t('common.remove_due_date')}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Estimation Menu - Matching TaskEstimationMenu exactly */}
                {boardConfig?.estimation_type && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Timer className="h-4 w-4 text-dynamic-pink" />
                      {t('common.estimation')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-40">
                      <div className="max-h-50 overflow-auto">
                        <div className="p-1">
                          {estimationOptions.map((idx) => {
                            const disabledByExtended =
                              !boardConfig?.extended_estimation && idx > 5;
                            const label = mapEstimationPoints(
                              idx,
                              boardConfig?.estimation_type
                            );

                            return (
                              <DropdownMenuItem
                                key={idx}
                                disabled={bulkWorking || disabledByExtended}
                                onClick={() => bulkUpdateEstimation(idx)}
                                className="flex cursor-pointer items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Timer className="h-4 w-4 text-dynamic-pink" />
                                  <span>
                                    {label}
                                    {disabledByExtended && (
                                      <span className="ml-1 text-[10px] text-muted-foreground/60">
                                        ({t('common.upgrade')})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </DropdownMenuItem>
                            );
                          })}
                        </div>
                      </div>
                      <div className="border-t bg-background">
                        <DropdownMenuItem
                          disabled={bulkWorking}
                          onClick={() => bulkUpdateEstimation(null)}
                          className="cursor-pointer text-muted-foreground"
                        >
                          <X className="h-4 w-4" />
                          {t('common.none')}
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                {/* Labels Menu - Matching TaskLabelsMenu with toggle functionality */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Tags className="h-4 w-4 text-dynamic-sky" />
                    {t('common.labels')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-80 p-0">
                    {/* Search Input */}
                    <div className="border-b p-2">
                      <div className="relative">
                        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder={t('common.search_labels')}
                          value={labelSearchQuery}
                          onChange={(e) => setLabelSearchQuery(e.target.value)}
                          className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
                        />
                      </div>
                    </div>

                    {/* Labels List */}
                    {filteredLabels.length === 0 ? (
                      <div className="px-2 py-6 text-center text-muted-foreground text-xs">
                        {labelSearchQuery
                          ? t('common.no_labels_found')
                          : t('common.no_labels_available')}
                      </div>
                    ) : (
                      <div className="max-h-50 overflow-auto">
                        <div className="flex flex-col gap-1 p-1">
                          {filteredLabels.slice(0, 50).map((label) => {
                            const isApplied = appliedLabels.has(label.id);
                            return (
                              <DropdownMenuItem
                                key={label.id}
                                disabled={bulkWorking}
                                onClick={(e) => {
                                  e.preventDefault();
                                  // Toggle: if applied to all selected tasks, remove; otherwise add
                                  if (isApplied) {
                                    bulkRemoveLabel(label.id);
                                  } else {
                                    bulkAddLabel(label.id);
                                  }
                                }}
                                className={`flex cursor-pointer items-center justify-between gap-2 ${
                                  isApplied
                                    ? 'bg-dynamic-sky/10 text-dynamic-sky'
                                    : ''
                                }`}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span
                                    className="h-3 w-3 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: label.color,
                                      opacity: 0.9,
                                    }}
                                  />
                                  <span className="truncate text-sm">
                                    {label.name}
                                  </span>
                                </div>
                                {isApplied && (
                                  <Check className="h-4 w-4 shrink-0" />
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Footer with count */}
                    {appliedLabels.size > 0 && (
                      <div className="relative z-10 border-t bg-background shadow-sm">
                        <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
                          {t('ws-task-boards.bulk.applied_to_all', {
                            count: appliedLabels.size,
                          })}
                        </div>
                      </div>
                    )}

                    {/* Create New Label Button */}
                    <div className="border-t">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          toast.info(tc('feature_coming_soon'));
                        }}
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-4 w-4" />
                        {tc('create_new_label')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={bulkWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          bulkClearLabels();
                        }}
                        className="cursor-pointer text-dynamic-red hover:text-dynamic-red"
                      >
                        <X className="h-4 w-4" />
                        {t('ws-task-boards.bulk.clear_all_labels')}
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Projects Menu - Matching TaskProjectsMenu with toggle functionality */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Box className="h-4 w-4 text-dynamic-sky" />
                    {tc('projects')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-80 p-0">
                    {/* Search Input */}
                    <div className="border-b p-2">
                      <div className="relative">
                        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder={tc('search_projects')}
                          value={projectSearchQuery}
                          onChange={(e) =>
                            setProjectSearchQuery(e.target.value)
                          }
                          className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
                        />
                      </div>
                    </div>

                    {/* Projects List */}
                    {filteredProjects.length === 0 ? (
                      <div className="px-2 py-6 text-center text-muted-foreground text-xs">
                        {projectSearchQuery
                          ? tc('no_projects_found')
                          : tc('no_projects_available')}
                      </div>
                    ) : (
                      <div className="max-h-50 overflow-auto">
                        <div className="flex flex-col gap-1 p-1">
                          {filteredProjects.slice(0, 50).map((project: any) => {
                            const isApplied = appliedProjects.has(project.id);
                            return (
                              <DropdownMenuItem
                                key={project.id}
                                disabled={bulkWorking}
                                onClick={(e) => {
                                  e.preventDefault();
                                  // Toggle: if applied to all selected tasks, remove; otherwise add
                                  if (isApplied) {
                                    bulkRemoveProject(project.id);
                                  } else {
                                    bulkAddProject(project.id);
                                  }
                                }}
                                className={`flex cursor-pointer items-center justify-between gap-2 ${
                                  isApplied
                                    ? 'bg-dynamic-sky/10 text-dynamic-sky'
                                    : ''
                                }`}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <Box className="h-3 w-3 shrink-0 text-dynamic-sky" />
                                  <span className="truncate text-sm">
                                    {project.name}
                                  </span>
                                </div>
                                {isApplied && (
                                  <Check className="h-4 w-4 shrink-0" />
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Footer with count */}
                    {appliedProjects.size > 0 && (
                      <div className="relative z-10 border-t bg-background shadow-sm">
                        <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
                          {t('ws-task-boards.bulk.applied_to_all', {
                            count: appliedProjects.size,
                          })}
                        </div>
                      </div>
                    )}

                    {/* Create New Project Button */}
                    <div className="border-t">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          toast.info('Create project feature coming soon');
                        }}
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-4 w-4" />
                        {t('common.create_new_project')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={bulkWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          bulkClearProjects();
                        }}
                        className="cursor-pointer text-dynamic-red hover:text-dynamic-red"
                      >
                        <X className="h-4 w-4" />
                        {t('ws-task-boards.bulk.clear_all_projects')}
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                {/* Move Menu - Matching TaskMoveMenu */}
                {columns.length > 1 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Move className="h-4 w-4 text-dynamic-blue" />
                      {t('common.move_to_list')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-100 w-56 overflow-hidden p-0">
                      <div className="max-h-50 overflow-auto">
                        <div className="p-1">
                          {columns.map((list) => {
                            const getStatusIcon = (status: string) => {
                              switch (status) {
                                case 'done':
                                  return CheckCircle2;
                                case 'closed':
                                  return CircleSlash;
                                case 'not_started':
                                  return CircleDashed;
                                case 'active':
                                  return CircleFadingArrowUpIcon;
                                default:
                                  return List;
                              }
                            };

                            const getStatusColor = (status: string) => {
                              switch (status) {
                                case 'done':
                                  return 'text-dynamic-green';
                                case 'closed':
                                  return 'text-dynamic-purple';
                                case 'active':
                                  return 'text-dynamic-blue';
                                default:
                                  return 'opacity-70';
                              }
                            };

                            const StatusIcon = getStatusIcon(list.status);
                            const statusColor = getStatusColor(list.status);

                            return (
                              <DropdownMenuItem
                                key={list.id}
                                disabled={bulkWorking}
                                onClick={(e) => {
                                  e.preventDefault();
                                  bulkMoveToList(list.id, list.name);
                                }}
                                className="cursor-pointer"
                              >
                                <div className="flex w-full items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <StatusIcon
                                      className={`h-4 w-4 ${statusColor}`}
                                    />
                                    {list.name}
                                  </div>
                                </div>
                              </DropdownMenuItem>
                            );
                          })}
                        </div>
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                {/* Assignees Menu - Matching TaskAssigneesMenu */}
                {!workspace.personal && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <UserStar className="h-4 w-4 text-dynamic-yellow" />
                      {t('common.assignees')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-80 p-0">
                      {/* Search Input */}
                      <div className="border-b p-2">
                        <div className="relative">
                          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder={tc('search_members')}
                            value={assigneeSearchQuery}
                            onChange={(e) =>
                              setAssigneeSearchQuery(e.target.value)
                            }
                            className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
                          />
                        </div>
                      </div>

                      {/* Members List */}
                      {filteredMembers.length === 0 ? (
                        <div className="px-2 py-6 text-center text-muted-foreground text-xs">
                          {assigneeSearchQuery
                            ? tc('no_members_found')
                            : tc('no_members_available')}
                        </div>
                      ) : (
                        <div className="max-h-37.5 overflow-auto">
                          <div className="flex flex-col gap-1 p-1">
                            {filteredMembers.slice(0, 50).map((member: any) => {
                              const isApplied = appliedAssignees.has(member.id);
                              return (
                                <DropdownMenuItem
                                  key={member.id}
                                  disabled={bulkWorking}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    // Toggle: if applied to all selected tasks, remove; otherwise add
                                    if (isApplied) {
                                      bulkRemoveAssignee(member.id);
                                    } else {
                                      bulkAddAssignee(member.id);
                                    }
                                  }}
                                  className={`flex cursor-pointer items-center justify-between gap-2 ${
                                    isApplied
                                      ? 'bg-dynamic-yellow/10 text-dynamic-yellow'
                                      : ''
                                  }`}
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <Avatar className="h-4 w-4 shrink-0">
                                      <AvatarImage src={member.avatar_url} />
                                      <AvatarFallback className="bg-muted font-semibold text-[9px]">
                                        {member.display_name?.[0] ||
                                          member.email?.[0] ||
                                          '?'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="truncate text-sm">
                                      {member.display_name || member.email}
                                    </span>
                                  </div>
                                  {isApplied && (
                                    <Check className="h-4 w-4 shrink-0" />
                                  )}
                                </DropdownMenuItem>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Footer with count */}
                      {appliedAssignees.size > 0 && (
                        <div className="relative z-10 border-t bg-background shadow-sm">
                          <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
                            {t('ws-task-boards.bulk.assigned_to_all', {
                              count: appliedAssignees.size,
                            })}
                          </div>
                        </div>
                      )}

                      {/* Clear all assignees */}
                      <div className="border-t">
                        <DropdownMenuItem
                          disabled={bulkWorking}
                          onClick={(e) => {
                            e.preventDefault();
                            bulkClearAssignees();
                          }}
                          className="cursor-pointer text-dynamic-red hover:text-dynamic-red"
                        >
                          <X className="h-4 w-4" />
                          {t('ws-task-boards.bulk.clear_all_assignees')}
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                <DropdownMenuSeparator />

                {/* Delete tasks */}
                <DropdownMenuItem
                  onClick={() => setBulkDeleteOpen(true)}
                  className="cursor-pointer text-dynamic-red focus:text-dynamic-red"
                  disabled={bulkWorking}
                >
                  <Trash2 className="h-4 w-4 text-dynamic-red" />
                  {t('common.delete_tasks')}
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
              {t('common.move')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-6 px-2 text-xs"
              disabled={bulkWorking}
            >
              {t('common.clear')}
            </Button>
          </div>
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
              className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent relative flex h-full w-full gap-2 overflow-x-auto"
            >
              <SortableContext
                items={columnsId}
                strategy={horizontalListSortingStrategy}
              >
                <div ref={boardRef} className="flex h-full gap-2 p-2">
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
                          bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
                          wsId={workspace.id}
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
        isMoving={moveTaskToBoardMutation.isPending || bulkWorking}
      />

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-105">
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

      {/* Bulk custom date dialog */}
      <BulkCustomDateDialog
        open={bulkCustomDateOpen}
        onOpenChange={setBulkCustomDateOpen}
        onDateChange={(date) => {
          bulkUpdateCustomDueDate(date ?? null);
          setBulkCustomDateOpen(false);
        }}
        onClear={() => {
          bulkUpdateDueDate('clear');
          setBulkCustomDateOpen(false);
        }}
        isLoading={bulkWorking}
      />
    </div>
  );
}
