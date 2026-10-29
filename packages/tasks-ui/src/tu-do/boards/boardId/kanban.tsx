'use client';

import type { DragEndEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
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
import { coordinateGetter } from '@tuturuuu/utils/keyboard-preset';
import { useBoardConfig, useReorderTask } from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { useOptionalWorkspacePresenceContext } from '../../providers/workspace-presence-provider';
import { useBoardBroadcast } from '../../shared/board-broadcast-context';
import type { ListStatusFilter } from '../../shared/board-header';
import { buildEstimationIndices } from '../../shared/estimation-mapping';
import type {
  SpecialTaskListPin,
  SpecialTaskListPinState,
} from '../../shared/special-task-list-pins';
import { TaskBoardLoadingState } from '../../shared/task-board-loading-state';
import {
  shouldShowTaskSearchEmpty,
  TaskSearchEmptyState,
} from '../../shared/task-search-empty-state';
import { BoardSelector } from '../board-selector';
import { BulkActionsIsland } from './kanban/bulk/bulk-actions-island';
import { BulkCustomDateDialog } from './kanban/bulk/bulk-custom-date-dialog';
import { BulkDeleteDialog } from './kanban/bulk/bulk-delete-dialog';
import { useBulkOperations } from './kanban/bulk/bulk-operations';
import { useAppliedSets } from './kanban/data/use-applied-sets';
import { useBulkResources } from './kanban/data/use-bulk-resources';
import { useFilteredResources } from './kanban/data/use-filtered-resources';
import { sortKanbanColumns } from './kanban/dnd/column-reorder';
import { DragPreview } from './kanban/dnd/drag-preview';
import { kanbanCollisionDetection } from './kanban/dnd/kanban-collision';
import { shouldBlockManualTaskOrdering } from './kanban/dnd/manual-task-ordering';
import { useKanbanDnd } from './kanban/dnd/use-kanban-dnd';
import { DRAG_ACTIVATION_DISTANCE } from './kanban/kanban-constants';
import { ManualTaskOrderingDialog } from './kanban/manual-task-ordering-dialog';
import { KanbanColumns } from './kanban/rendering/kanban-columns';
import { useKeyboardShortcuts } from './kanban/selection/use-keyboard-shortcuts';
import { useMultiSelect } from './kanban/selection/use-multi-select';
import type { TaskFilters } from './task-filter';

interface Props {
  workspace: Pick<Workspace, 'id' | 'personal'>;
  workspaceTier?: WorkspaceProductTier | null;
  workspaceId: string;
  boardId: string | null;
  tasks: Task[];
  lists: TaskList[];
  isLoading: boolean;
  isSearchError?: boolean;
  disableSort?: boolean;
  listStatusFilter?: ListStatusFilter;
  filters?: TaskFilters;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
  onExternalTasksCollapsedChange?: (collapsed: boolean) => void;
  onTaskListCollapsedChange?: (listId: string, collapsed: boolean) => void;
  specialTaskListPins?: SpecialTaskListPinState;
  onSpecialTaskListPinnedChange?: (
    pin: SpecialTaskListPin,
    pinned: boolean
  ) => void;
  onBulkSelectionActiveChange?: (active: boolean) => void;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: 'workspace' | 'board' | 'workspace-and-board';
  onHoveredTaskListChange?: (listId: string | null) => void;
  readOnly?: boolean;
  onFiltersChange?: (filters: TaskFilters) => void;
}

export function KanbanBoard({
  workspace,
  workspaceId,
  boardId,
  tasks,
  lists,
  isLoading,
  isSearchError = false,
  disableSort = false,
  listStatusFilter = 'all',
  filters,
  isMultiSelectMode,
  setIsMultiSelectMode,
  onExternalTasksCollapsedChange,
  onTaskListCollapsedChange,
  specialTaskListPins,
  onSpecialTaskListPinnedChange,
  onBulkSelectionActiveChange,
  canUseBoardAssignees,
  assigneeMemberSource,
  onHoveredTaskListChange,
  readOnly = false,
  onFiltersChange,
}: Props) {
  const tLayout = useTranslations('ws-task-boards.layout_settings');
  const tTasks = useTranslations('ws-tasks');
  const invalidColumnMoveMessage = tLayout.has('cannot_reorder_across_statuses')
    ? tLayout('cannot_reorder_across_statuses')
    : 'Task lists can only be reordered within the same status group';
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkCustomDateOpen, setBulkCustomDateOpen] = useState(false);
  const [manualOrderingDialogOpen, setManualOrderingDialogOpen] =
    useState(false);

  // Search state
  const [labelSearchQuery, setLabelSearchQuery] = useState('');
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');

  // Refs
  const taskHeightsRef = useRef<Map<string, number>>(new Map());
  const boardRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const wsPresence = useOptionalWorkspacePresenceContext();
  const cursorsEnabled =
    !readOnly &&
    !workspace.personal &&
    !!boardId &&
    !!wsPresence?.cursorsEnabled &&
    !wsPresence.isBoardOverLimit(boardId);

  const reorderTaskMutation = useReorderTask(boardId ?? '', workspaceId);
  const { createTask } = useTaskDialog();
  const { weekStartsOn } = useCalendarPreferences();
  const boardAssigneesEnabled = canUseBoardAssignees ?? !workspace.personal;

  const { data: boardConfig } = useBoardConfig(
    readOnly ? null : boardId,
    readOnly ? null : workspaceId
  );
  const persistListPositions = useCallback(
    async (updates: Array<{ listId: string; newPosition: number }>) => {
      if (!boardId || updates.length === 0) return;
      if (readOnly) return;

      await Promise.all(
        updates.map(({ listId, newPosition }) =>
          updateWorkspaceTaskList(workspaceId, boardId, listId, {
            position: newPosition,
          })
        )
      );
    },
    [boardId, readOnly, workspaceId]
  );

  const columns: TaskList[] = lists.map((list) => ({
    ...list,
    title: list.name,
  }));

  const orderedColumns = useMemo(() => {
    const sortedColumns = sortKanbanColumns(columns);
    const externalColumns = sortedColumns.filter(
      (column) => column.is_external_staging
    );
    const realColumns = sortedColumns.filter(
      (column) => !column.is_external_staging
    );

    if (!specialTaskListPins?.closed_tasks) {
      return [...externalColumns, ...realColumns];
    }

    const closedColumns = realColumns.filter(
      (column) => column.status === 'closed'
    );
    const otherColumns = realColumns.filter(
      (column) => column.status !== 'closed'
    );

    return [...externalColumns, ...closedColumns, ...otherColumns];
  }, [columns, specialTaskListPins?.closed_tasks]);
  const orderedRealColumns = useMemo(
    () => orderedColumns.filter((column) => !column.is_external_staging),
    [orderedColumns]
  );
  const columnsId = useMemo(
    () => orderedColumns.map((col) => col.id),
    [orderedColumns]
  );
  // Selection Hook
  const { selectedTasks, handleTaskSelect, clearSelection } = useMultiSelect(
    tasks,
    readOnly ? false : isMultiSelectMode,
    setIsMultiSelectMode
  );

  useEffect(() => {
    onBulkSelectionActiveChange?.(selectedTasks.size > 0);
  }, [onBulkSelectionActiveChange, selectedTasks.size]);

  useEffect(
    () => () => {
      onBulkSelectionActiveChange?.(false);
    },
    [onBulkSelectionActiveChange]
  );

  // Resources Hooks
  const { workspaceLabels, workspaceProjects, workspaceMembers } =
    useBulkResources({
      boardId,
      canUseBoardAssignees: boardAssigneesEnabled,
      assigneeMemberSource,
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
    columns: orderedRealColumns,
    workspaceLabels,
    workspaceProjects,
    workspaceMembers,
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
          const targetList = orderedRealColumns.find(
            (c) => c.id === targetListId
          );
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
    [selectedTasks, boardId, orderedRealColumns, bulkOps, clearSelection]
  );

  // Keyboard Shortcuts
  useKeyboardShortcuts({
    columns: orderedRealColumns,
    boardId,
    filters,
    selectedTasks: readOnly ? new Set<string>() : selectedTasks,
    isMultiSelectMode: readOnly ? false : isMultiSelectMode,
    setIsMultiSelectMode: readOnly ? () => {} : setIsMultiSelectMode,
    createTask: readOnly ? () => {} : createTask,
    clearSelection,
    handleCrossBoardMove: () => {
      if (readOnly) return;
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
    getDragPreviewPosition,
    optimisticUpdateInProgress,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragCancel,
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
    invalidExternalStagingMoveMessage: tTasks('external_tasks_only_warning'),
    personalPlacementUpdateFailedMessage: tTasks(
      'failed_update_personal_placement'
    ),
    reorderTaskMutation,
    taskHeightsRef,
    scrollContainerRef: boardRef,
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

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const latestPreview = getDragPreviewPosition();
      const blockManualOrdering = shouldBlockManualTaskOrdering({
        activeData: event.active.data.current,
        criteriaSortingActive: disableSort,
        overData: event.over?.data.current,
        overId: event.over?.id,
        preview: latestPreview
          ? {
              listId: latestPreview.listId,
              taskId: latestPreview.task.id,
            }
          : null,
      });

      if (blockManualOrdering) {
        onDragCancel();
        setManualOrderingDialogOpen(true);
        return;
      }

      await onDragEnd(event);
    },
    [disableSort, getDragPreviewPosition, onDragCancel, onDragEnd]
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
    return <TaskBoardLoadingState />;
  }

  if (
    (Boolean(filters?.searchQuery?.trim()) && isSearchError) ||
    shouldShowTaskSearchEmpty({
      query: filters?.searchQuery,
      taskCount: tasks.length,
      pending: false,
      failed: isSearchError,
    })
  ) {
    return (
      <TaskSearchEmptyState
        failed={isSearchError}
        query={filters?.searchQuery ?? ''}
        onClear={
          onFiltersChange && filters
            ? () => onFiltersChange({ ...filters, searchQuery: '' })
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!readOnly && (
        <BulkActionsIsland
          selectedCount={selectedTasks.size}
          bulkWorking={bulkWorking}
          onClearSelection={clearSelection}
          onOpenBoardSelector={() => setBoardSelectorOpen(true)}
          menuProps={{
            workspace,
            boardConfig,
            columns: orderedRealColumns,
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
      )}

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={readOnly ? [] : sensors}
          collisionDetection={kanbanCollisionDetection}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragOver={onDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={onDragCancel}
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
            canUseBoardAssignees={boardAssigneesEnabled}
            assigneeMemberSource={assigneeMemberSource}
            cursorsEnabled={cursorsEnabled}
            disableSort={disableSort}
            selectedTasks={readOnly ? new Set<string>() : selectedTasks}
            isMultiSelectMode={readOnly ? false : isMultiSelectMode}
            setIsMultiSelectMode={readOnly ? () => {} : setIsMultiSelectMode}
            onTaskSelect={readOnly ? () => {} : handleTaskSelect}
            onClearSelection={clearSelection}
            onUpdate={() => {}} // Optimistic updates handled in DnD
            dragPreviewPosition={dragPreviewPosition}
            suppressTaskTransforms={Boolean(activeTask)}
            createTask={createTask}
            taskHeightsRef={taskHeightsRef}
            optimisticUpdateInProgress={optimisticUpdateInProgress}
            filters={filters}
            listStatusFilter={listStatusFilter}
            bulkUpdateCustomDueDate={async (date) => {
              await bulkOps.bulkUpdateCustomDueDate(date);
            }}
            boardRef={boardRef}
            columnsId={columnsId}
            onExternalTasksCollapsedChange={onExternalTasksCollapsedChange}
            onTaskListCollapsedChange={onTaskListCollapsedChange}
            specialTaskListPins={specialTaskListPins}
            onSpecialTaskListPinnedChange={onSpecialTaskListPinnedChange}
            onHoveredTaskListChange={onHoveredTaskListChange}
            readOnly={readOnly}
          />

          {!readOnly && (
            <DragOverlay dropAnimation={null}>
              <DragPreview
                activeTask={activeTask}
                activeColumn={activeColumn}
                tasks={tasks}
                columns={orderedColumns}
                boardId={boardId ?? ''}
                isPersonalWorkspace={workspace.personal}
                canUseBoardAssignees={boardAssigneesEnabled}
                assigneeMemberSource={assigneeMemberSource}
                isMultiSelectMode={isMultiSelectMode}
                selectedTasks={selectedTasks}
                onUpdate={() => {}}
                wsId={workspaceId}
              />
            </DragOverlay>
          )}
        </DndContext>
      </div>

      {!readOnly && (
        <>
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

          {filters && onFiltersChange && (
            <ManualTaskOrderingDialog
              open={manualOrderingDialogOpen}
              onOpenChange={setManualOrderingDialogOpen}
              onEnableManualOrdering={() =>
                onFiltersChange({ ...filters, sortBy: undefined })
              }
            />
          )}
        </>
      )}
    </div>
  );
}
