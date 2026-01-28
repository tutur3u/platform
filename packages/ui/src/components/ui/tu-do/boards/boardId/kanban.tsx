'use client';

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { toast } from '@tuturuuu/ui/sonner';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { coordinateGetter } from '@tuturuuu/utils/keyboard-preset';
import {
  useBoardConfig,
  useMoveTaskToBoard,
  useReorderTask,
} from '@tuturuuu/utils/task-helper';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { TaskViewerProvider } from '../../providers/task-viewer-provider';
import type { ListStatusFilter } from '../../shared/board-header';
import { buildEstimationIndices } from '../../shared/estimation-mapping';
import { BoardSelector } from '../board-selector';
import { BulkActionsBar } from './kanban/bulk/bulk-actions-bar';
import { BulkCustomDateDialog } from './kanban/bulk/bulk-custom-date-dialog';
import { BulkDeleteDialog } from './kanban/bulk/bulk-delete-dialog';
import { useBulkOperations } from './kanban/bulk/bulk-operations';
import { useAppliedSets } from './kanban/data/use-applied-sets';
import { useBulkResources } from './kanban/data/use-bulk-resources';
import { useFilteredResources } from './kanban/data/use-filtered-resources';
import { DragPreview } from './kanban/dnd/drag-preview';
import { useKanbanDnd } from './kanban/dnd/use-kanban-dnd';
import { DRAG_ACTIVATION_DISTANCE } from './kanban/kanban-constants';
import { KanbanColumns } from './kanban/rendering/kanban-columns';
import { KanbanSkeleton } from './kanban/rendering/kanban-skeleton';
import { useKeyboardShortcuts } from './kanban/selection/use-keyboard-shortcuts';
import { useMultiSelect } from './kanban/selection/use-multi-select';
import type { TaskFilters } from './task-filter';

interface Props {
  workspace: Workspace;
  boardId: string | null;
  tasks: Task[];
  lists: TaskList[];
  isLoading: boolean;
  disableSort?: boolean;
  listStatusFilter?: ListStatusFilter;
  filters?: TaskFilters;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
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
  const { modKey } = usePlatform();
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkCustomDateOpen, setBulkCustomDateOpen] = useState(false);

  // Search state
  const [labelSearchQuery, setLabelSearchQuery] = useState('');
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const taskHeightsRef = useRef<Map<string, number>>(new Map());
  const boardRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const supabase = createClient();
  const moveTaskToBoardMutation = useMoveTaskToBoard(boardId ?? '');
  const reorderTaskMutation = useReorderTask(boardId ?? '');
  const { createTask } = useTaskDialog();
  const { weekStartsOn } = useCalendarPreferences();

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
    title: list.name,
  }));

  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  // Selection Hook
  const { selectedTasks, handleTaskSelect, clearSelection } = useMultiSelect(
    tasks,
    isMultiSelectMode,
    setIsMultiSelectMode
  );

  // Resources Hooks
  const { workspaceLabels, workspaceProjects, workspaceMembers } =
    useBulkResources({
      workspace,
      isMultiSelectMode,
      selectedCount: selectedTasks.size,
    });

  const appliedSets = useAppliedSets(tasks, selectedTasks);

  const filtered = useFilteredResources({
    workspaceLabels,
    workspaceProjects,
    workspaceMembers,
    search: {
      labelQuery: labelSearchQuery,
      projectQuery: projectSearchQuery,
      assigneeQuery: assigneeSearchQuery,
    },
  });

  // Bulk Operations
  const bulkOps = useBulkOperations({
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
        for (const taskId of tasksToMove) {
          try {
            await moveTaskToBoardMutation.mutateAsync({
              taskId,
              newListId: targetListId,
              targetBoardId,
            });
          } catch (error) {
            console.error(`Failed to move task ${taskId}:`, error);
          }
        }

        clearSelection();
        setBoardSelectorOpen(false);
      } catch (error) {
        console.error('Failed to move tasks:', error);
      }
    },
    [selectedTasks, moveTaskToBoardMutation, clearSelection]
  );

  // Keyboard Shortcuts
  useKeyboardShortcuts({
    columns,
    boardId,
    filters,
    selectedTasks,
    isMultiSelectMode,
    setIsMultiSelectMode,
    createTask,
    clearSelection,
    handleCrossBoardMove,
  });

  // DnD Hook
  const {
    activeColumn,
    activeTask,
    dragPreviewPosition,
    optimisticUpdateInProgress,
    onDragStart,
    onDragOver,
    onDragEnd,
  } = useKanbanDnd({
    boardId,
    columns,
    tasks,
    disableSort,
    selectedTasks,
    isMultiSelectMode,
    clearSelection,
    moveListMutation,
    reorderTaskMutation,
    taskHeightsRef,
    scrollContainerRef,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: DRAG_ACTIVATION_DISTANCE,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinateGetter,
    })
  );

  const estimationOptions = useMemo(() => {
    if (!boardConfig?.estimation_type) return [] as number[];
    return buildEstimationIndices({
      extended: boardConfig.extended_estimation,
      allowZero: boardConfig.allow_zero_estimates,
    });
  }, [
    boardConfig?.estimation_type,
    boardConfig?.extended_estimation,
    boardConfig?.allow_zero_estimates,
  ]);

  const appliedSetsMap = useMemo(
    () => ({
      labels: appliedSets.appliedLabels,
      projects: appliedSets.appliedProjects,
      assignees: appliedSets.appliedAssignees,
    }),
    [appliedSets]
  );

  const filteredMap = useMemo(
    () => ({
      labels: filtered.filteredLabels,
      projects: filtered.filteredProjects,
      members: filtered.filteredMembers,
    }),
    [filtered]
  );

  if (isLoading) {
    return <KanbanSkeleton />;
  }

  return (
    <div className="flex h-full flex-col">
      <BulkActionsBar
        selectedCount={selectedTasks.size}
        isMultiSelectMode={isMultiSelectMode}
        bulkWorking={bulkWorking}
        modKey={modKey}
        onClearSelection={clearSelection}
        onOpenBoardSelector={() => setBoardSelectorOpen(true)}
        menuProps={{
          workspace,
          boardConfig,
          columns,
          bulkWorking,
          estimationOptions,
          appliedSets: appliedSetsMap,
          filtered: filteredMap,
          search: {
            labelQuery: labelSearchQuery,
            setLabelQuery: setLabelSearchQuery,
            projectQuery: projectSearchQuery,
            setProjectQuery: setProjectSearchQuery,
            assigneeQuery: assigneeSearchQuery,
            setAssigneeQuery: setAssigneeSearchQuery,
          },
          actions: {
            bulkMoveToStatus: (s) => bulkOps.bulkMoveToStatus(s as any),
            bulkUpdatePriority: (p) => bulkOps.bulkUpdatePriority(p as any),
            bulkUpdateDueDate: (t) => bulkOps.bulkUpdateDueDate(t as any),
            bulkUpdateEstimation: bulkOps.bulkUpdateEstimation,
            bulkAddLabel: bulkOps.bulkAddLabel,
            bulkRemoveLabel: bulkOps.bulkRemoveLabel,
            bulkClearLabels: bulkOps.bulkClearLabels,
            bulkAddProject: bulkOps.bulkAddProject,
            bulkRemoveProject: bulkOps.bulkRemoveProject,
            bulkClearProjects: bulkOps.bulkClearProjects,
            bulkMoveToList: bulkOps.bulkMoveToList,
            bulkAddAssignee: bulkOps.bulkAddAssignee,
            bulkRemoveAssignee: bulkOps.bulkRemoveAssignee,
            bulkClearAssignees: bulkOps.bulkClearAssignees,
          },
          onOpenCustomDate: () => setBulkCustomDateOpen(true),
          onConfirmDelete: () => setBulkDeleteOpen(true),
        }}
      />

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
            <KanbanColumns
              columns={columns}
              tasks={tasks}
              boardId={boardId ?? ''}
              workspaceId={workspace.id}
              isPersonalWorkspace={workspace.personal}
              disableSort={disableSort}
              selectedTasks={selectedTasks}
              isMultiSelectMode={isMultiSelectMode}
              setIsMultiSelectMode={setIsMultiSelectMode}
              onTaskSelect={handleTaskSelect}
              onClearSelection={clearSelection}
              onUpdate={() => {}} // Optimistic updates handled in DnD
              createTask={createTask}
              dragPreviewPosition={dragPreviewPosition}
              taskHeightsRef={taskHeightsRef}
              optimisticUpdateInProgress={optimisticUpdateInProgress}
              filters={filters}
              listStatusFilter={listStatusFilter}
              bulkUpdateCustomDueDate={async (date) => {
                await bulkOps.bulkUpdateCustomDueDate(date);
              }}
              boardRef={boardRef}
              columnsId={columnsId}
            />

            <DragOverlay dropAnimation={null}>
              <DragPreview
                activeTask={activeTask}
                activeColumn={activeColumn}
                tasks={tasks}
                columns={columns}
                boardId={boardId ?? ''}
                isPersonalWorkspace={workspace.personal}
                isMultiSelectMode={isMultiSelectMode}
                selectedTasks={selectedTasks}
                onUpdate={() => {}}
                wsId={workspace.id}
              />
            </DragOverlay>
          </DndContext>
        </div>
      </TaskViewerProvider>

      <BoardSelector
        open={boardSelectorOpen}
        onOpenChange={setBoardSelectorOpen}
        wsId={workspace.id}
        currentBoardId={boardId ?? ''}
        taskCount={selectedTasks.size}
        onMove={handleBoardMove}
        isMoving={moveTaskToBoardMutation.isPending || bulkWorking}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        selectedCount={selectedTasks.size}
        onConfirm={bulkOps.bulkDeleteTasks}
        isLoading={bulkWorking}
      />

      <BulkCustomDateDialog
        open={bulkCustomDateOpen}
        onOpenChange={setBulkCustomDateOpen}
        onDateChange={(date) => {
          bulkOps.bulkUpdateCustomDueDate(date ?? null);
          setBulkCustomDateOpen(false);
        }}
        onClear={() => {
          bulkOps.bulkUpdateDueDate('clear');
          setBulkCustomDateOpen(false);
        }}
        isLoading={bulkWorking}
      />
    </div>
  );
}
