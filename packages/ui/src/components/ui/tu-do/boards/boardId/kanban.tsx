'use client';

import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceTaskList } from '@tuturuuu/internal-api';
import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { toast } from '@tuturuuu/ui/sonner';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { coordinateGetter } from '@tuturuuu/utils/keyboard-preset';
import { useBoardConfig, useReorderTask } from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { useOptionalWorkspacePresenceContext } from '../../providers/workspace-presence-provider';
import { useBoardBroadcast } from '../../shared/board-broadcast-context';
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
import { sortKanbanColumns } from './kanban/dnd/column-reorder';
import { DragPreview } from './kanban/dnd/drag-preview';
import { useKanbanDnd } from './kanban/dnd/use-kanban-dnd';
import { DRAG_ACTIVATION_DISTANCE } from './kanban/kanban-constants';
import { KanbanColumns } from './kanban/rendering/kanban-columns';
import { KanbanSkeleton } from './kanban/rendering/kanban-skeleton';
import { useKeyboardShortcuts } from './kanban/selection/use-keyboard-shortcuts';
import { useMultiSelect } from './kanban/selection/use-multi-select';
import type { TaskFilters } from './task-filter';

// Prefer pointerWithin for precise targeting; fall back to closestCenter
// when the pointer isn't inside any droppable (e.g. between columns).
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};

interface Props {
  workspace: Workspace;
  workspaceTier?: WorkspaceProductTier | null;
  workspaceId: string;
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
  workspaceTier,
  workspaceId,
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
  const tLayout = useTranslations('ws-task-boards.layout_settings');
  const invalidColumnMoveMessage = tLayout.has('cannot_reorder_across_statuses')
    ? tLayout('cannot_reorder_across_statuses')
    : 'Task lists can only be reordered within the same status group';
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

  const reorderTaskMutation = useReorderTask(boardId ?? '', workspaceId);
  const { createTask } = useTaskDialog();
  const { weekStartsOn } = useCalendarPreferences();

  const { data: boardConfig } = useBoardConfig(boardId, workspaceId);
  const persistListPositions = useCallback(
    async (updates: Array<{ listId: string; newPosition: number }>) => {
      if (!boardId || updates.length === 0) return;

      await Promise.all(
        updates.map(({ listId, newPosition }) =>
          updateWorkspaceTaskList(workspaceId, boardId, listId, {
            position: newPosition,
          })
        )
      );
    },
    [boardId, workspaceId]
  );

  const columns: TaskList[] = lists.map((list) => ({
    ...list,
    title: list.name,
  }));

  const orderedColumns = useMemo(() => sortKanbanColumns(columns), [columns]);
  const columnsId = useMemo(
    () => orderedColumns.map((col) => col.id),
    [orderedColumns]
  );

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
  const broadcast = useBoardBroadcast();
  const bulkOps = useBulkOperations({
    queryClient,
    wsId: workspaceId,
    boardId: boardId ?? '',
    selectedTasks,
    columns: orderedColumns,
    workspaceLabels,
    workspaceProjects,
    weekStartsOn,
    setBulkWorking,
    clearSelection,
    setBulkDeleteOpen,
    broadcast,
  });

  // Unified move handler — dispatches to the correct bulk operation
  const handleBoardMove = useCallback(
    async (targetBoardId: string, targetListId: string) => {
      if (selectedTasks.size === 0) return;

      try {
        if (targetBoardId === (boardId ?? '')) {
          // Same board: find the target list name for the toast
          const targetList = columns.find((c) => c.id === targetListId);
          await bulkOps.bulkMoveToList(targetListId, targetList?.name ?? '');
        } else {
          await bulkOps.bulkMoveToBoard(targetBoardId, targetListId);
        }

        clearSelection();
        setBoardSelectorOpen(false);
      } catch (error) {
        console.error('Failed to move tasks:', error);
      }
    },
    [selectedTasks, boardId, columns, bulkOps, clearSelection]
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
    handleCrossBoardMove: () => {
      if (selectedTasks.size > 0) {
        setBoardSelectorOpen(true);
      }
    },
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
    wsId: workspaceId,
    boardId,
    columns: orderedColumns,
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

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={kanbanCollisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.WhileDragging,
            },
          }}
          autoScroll={false}
        >
          <KanbanColumns
            columns={orderedColumns}
            tasks={tasks}
            boardId={boardId ?? ''}
            workspaceId={workspaceId}
            isPersonalWorkspace={workspace.personal}
            cursorsEnabled={!!workspaceTier && workspaceTier !== 'FREE'}
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
              columns={orderedColumns}
              boardId={boardId ?? ''}
              isPersonalWorkspace={workspace.personal}
              isMultiSelectMode={isMultiSelectMode}
              selectedTasks={selectedTasks}
              onUpdate={() => {}}
              wsId={workspaceId}
            />
          </DragOverlay>
        </DndContext>
      </div>
      <BoardOverLimitToast boardId={boardId ?? ''} />

      <BoardSelector
        open={boardSelectorOpen}
        onOpenChange={setBoardSelectorOpen}
        wsId={workspaceId}
        currentBoardId={boardId ?? ''}
        taskCount={selectedTasks.size}
        onMove={handleBoardMove}
        isMoving={bulkWorking}
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

/**
 * Shows a one-time toast when the board exceeds the concurrent user limit.
 * Must be rendered inside WorkspacePresenceProvider.
 */
function BoardOverLimitToast({ boardId }: { boardId: string }) {
  const wsPresence = useOptionalWorkspacePresenceContext();
  const toastShownRef = useRef(false);

  const overLimit = wsPresence?.isBoardOverLimit(boardId) ?? false;

  useEffect(() => {
    if (overLimit && !toastShownRef.current) {
      toastShownRef.current = true;
      toast.info(
        'Board at capacity. Realtime features paused for this session.'
      );
    }
  }, [overLimit]);

  return null;
}
