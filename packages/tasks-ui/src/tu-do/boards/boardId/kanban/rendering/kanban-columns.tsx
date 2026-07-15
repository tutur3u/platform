'use client';

import {
  horizontalListSortingStrategy,
  SortableContext,
} from '@dnd-kit/sortable';
import { getBoardRealtimeChannelName } from '@tuturuuu/tasks-ui/hooks/useBoardRealtime.types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useLayoutEffect, useRef } from 'react';
import type { ListStatusFilter } from '../../../../shared/board-header';
import CursorOverlayMultiWrapper from '../../../../shared/cursor-overlay-multi-wrapper';
import type {
  SpecialTaskListPin,
  SpecialTaskListPinState,
} from '../../../../shared/special-task-list-pins';
import { BoardColumn } from '../../board-column';
import type { TaskFilters } from '../../task-filter';
import { TaskListForm } from '../../task-list-form';
import { compareTasksByEffectiveSortKey } from '../dnd/task-sort-key';
import type { DragPreviewPosition } from '../dnd/use-kanban-dnd';
import { isKanbanColumnCollapsed } from '../kanban-column-collapse';
import { getKanbanColumnWidth } from './kanban-column-width';
import {
  type KanbanDeadlineCollapsedState,
  type KanbanDeadlineLabels,
  KanbanDeadlinePanels,
  type KanbanDeadlineSection,
} from './kanban-deadline-panels';
import type { KanbanDeadlineSections } from './kanban-deadline-tasks';

const KANBAN_COLUMN_GAP = '0.75rem';
const COLLAPSED_SPECIAL_LIST_WIDTH = '3.5rem';

interface KanbanColumnsProps {
  columns: TaskList[];
  tasks: Task[];
  boardId: string;
  workspaceId: string;
  isPersonalWorkspace: boolean;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: 'workspace' | 'board' | 'workspace-and-board';
  cursorsEnabled?: boolean;
  disableSort: boolean;
  selectedTasks: Set<string>;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  onClearSelection: () => void;
  onUpdate: () => void;
  dragPreviewPosition?: DragPreviewPosition | null;
  suppressTaskTransforms?: boolean;
  createTask: (
    boardId: string,
    listId: string,
    columns: TaskList[],
    filters?: TaskFilters
  ) => void;
  taskHeightsRef: React.MutableRefObject<Map<string, number>>;
  optimisticUpdateInProgress: Set<string>;
  filters?: TaskFilters;
  listStatusFilter?: ListStatusFilter;
  bulkUpdateCustomDueDate: (date: Date | null) => Promise<void>;
  boardRef: React.RefObject<HTMLDivElement | null>;
  columnsId: string[];
  onExternalTasksCollapsedChange?: (collapsed: boolean) => void;
  onTaskListCollapsedChange?: (listId: string, collapsed: boolean) => void;
  deadlineLabels?: KanbanDeadlineLabels;
  deadlineSections?: KanbanDeadlineSections;
  deadlineSectionsLoading?: boolean;
  deadlineSectionsCollapsed?: KanbanDeadlineCollapsedState;
  deadlineNow?: number;
  onDeadlineSectionCollapsedChange?: (
    section: KanbanDeadlineSection,
    collapsed: boolean
  ) => void;
  specialTaskListPins?: SpecialTaskListPinState;
  onSpecialTaskListPinnedChange?: (
    pin: SpecialTaskListPin,
    pinned: boolean
  ) => void;
  onHoveredTaskListChange?: (listId: string | null) => void;
  readOnly?: boolean;
}

interface PinnedSpecialListLayout {
  offsets: Record<string, string>;
  totalWidth: string;
}

function toCalcExpression(parts: string[]) {
  if (parts.length === 0) return '0px';
  if (parts.length === 1) return parts[0] ?? '0px';
  return `calc(${parts.join(' + ')})`;
}

function getSpecialListWidth(collapsed: boolean) {
  return collapsed
    ? COLLAPSED_SPECIAL_LIST_WIDTH
    : 'var(--kanban-column-width)';
}

function getPinnedSpecialRailWidth(container: HTMLElement) {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(
      '[data-kanban-pinned-special="true"]'
    )
  );

  if (elements.length === 0) return 0;

  const rects = elements
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0);

  if (rects.length === 0) return 0;

  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));

  return Math.max(0, right - left);
}

export function KanbanColumns({
  columns,
  tasks,
  boardId,
  workspaceId,
  isPersonalWorkspace,
  canUseBoardAssignees,
  assigneeMemberSource,
  cursorsEnabled = true,
  disableSort,
  selectedTasks,
  isMultiSelectMode,
  setIsMultiSelectMode,
  onTaskSelect,
  onClearSelection,
  onUpdate,
  dragPreviewPosition,
  suppressTaskTransforms,
  createTask,
  taskHeightsRef,
  optimisticUpdateInProgress,
  filters,
  listStatusFilter,
  bulkUpdateCustomDueDate,
  boardRef,
  columnsId,
  onExternalTasksCollapsedChange,
  onTaskListCollapsedChange,
  deadlineLabels,
  deadlineSections,
  deadlineSectionsLoading,
  deadlineSectionsCollapsed,
  deadlineNow,
  onDeadlineSectionCollapsedChange,
  specialTaskListPins,
  onSpecialTaskListPinnedChange,
  onHoveredTaskListChange,
  readOnly = false,
}: KanbanColumnsProps) {
  const initialScrollAnchoredBoardRef = useRef<string | null>(null);
  const realColumns = columns.filter((column) => !column.is_external_staging);
  const deadlineSectionOrder: KanbanDeadlineSection[] = ['overdue', 'upcoming'];
  const deadlinePanelsEnabled =
    !readOnly && Boolean(boardId && deadlineSections && deadlineLabels);
  const reservedDeadlineSections = deadlinePanelsEnabled
    ? deadlineSectionOrder
    : [];
  const snapEdgePadding =
    columns.length > 0 || reservedDeadlineSections.length > 0
      ? '0.5rem'
      : '0px';
  const collapsedColumnCount =
    columns.filter(isKanbanColumnCollapsed).length +
    reservedDeadlineSections.filter(
      (section) => deadlineSectionsCollapsed?.[section] === true
    ).length;
  const dynamicColumnWidth = getKanbanColumnWidth({
    columnCount: columns.length + reservedDeadlineSections.length,
    collapsedColumnCount,
    snapEdgePadding,
    fillAvailableWidth: listStatusFilter === 'all',
  });
  const pinnedSpecialListLayout = (() => {
    const entries: { key: string; width: string }[] = [];

    if (deadlinePanelsEnabled && specialTaskListPins?.overdue) {
      entries.push({
        key: 'deadline:overdue',
        width: getSpecialListWidth(deadlineSectionsCollapsed?.overdue === true),
      });
    }

    if (deadlinePanelsEnabled && specialTaskListPins?.upcoming) {
      entries.push({
        key: 'deadline:upcoming',
        width: getSpecialListWidth(
          deadlineSectionsCollapsed?.upcoming === true
        ),
      });
    }

    for (const column of columns) {
      const pinned =
        column.is_external_staging === true
          ? specialTaskListPins?.external_tasks === true
          : column.status === 'closed'
            ? specialTaskListPins?.closed_tasks === true
            : false;

      if (!pinned) continue;

      entries.push({
        key: `column:${column.id}`,
        width: getSpecialListWidth(isKanbanColumnCollapsed(column)),
      });
    }

    const offsets: Record<string, string> = {};
    const parts: string[] = [];

    entries.forEach((entry, index) => {
      if (index > 0) parts.push(KANBAN_COLUMN_GAP);

      offsets[entry.key] = toCalcExpression(parts);
      parts.push(entry.width);
    });

    return {
      offsets,
      totalWidth: toCalcExpression(parts),
    } satisfies PinnedSpecialListLayout;
  })();
  const hasLeftSpecialColumns =
    reservedDeadlineSections.length > 0 ||
    columns.some((column) => column.is_external_staging);

  useLayoutEffect(() => {
    if (!hasLeftSpecialColumns) return;
    if (initialScrollAnchoredBoardRef.current === boardId) return;

    const container = boardRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(
      '[data-kanban-real-column="true"]'
    );
    if (!target) return;

    initialScrollAnchoredBoardRef.current = boardId;

    const anchor = () => {
      const pinnedRailWidth = getPinnedSpecialRailWidth(container);
      container.scrollLeft = Math.max(
        0,
        target.offsetLeft - pinnedRailWidth - 8
      );
    };

    anchor();

    if (typeof window.requestAnimationFrame !== 'function') {
      return;
    }

    const frame = window.requestAnimationFrame(anchor);
    return () => window.cancelAnimationFrame?.(frame);
  }, [boardId, boardRef, hasLeftSpecialColumns]);

  return (
    <div
      ref={boardRef}
      onPointerLeave={() => onHoveredTaskListChange?.(null)}
      className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent relative flex h-full w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth"
      style={
        {
          '--kanban-snap-left-padding': snapEdgePadding,
          '--kanban-snap-right-padding': snapEdgePadding,
          '--kanban-column-width': dynamicColumnWidth,
          scrollPaddingLeft:
            pinnedSpecialListLayout.totalWidth === '0px'
              ? 'var(--kanban-snap-left-padding)'
              : `calc(var(--kanban-snap-left-padding) + ${pinnedSpecialListLayout.totalWidth})`,
          scrollPaddingRight: 'var(--kanban-snap-right-padding)',
        } as React.CSSProperties
      }
    >
      <SortableContext
        items={columnsId}
        strategy={horizontalListSortingStrategy}
      >
        <div
          className="flex h-full min-w-full items-start gap-3 py-2"
          style={{
            paddingLeft: 'var(--kanban-snap-left-padding)',
            paddingRight: 'var(--kanban-snap-right-padding)',
          }}
        >
          {deadlinePanelsEnabled && deadlineSections && deadlineLabels && (
            <KanbanDeadlinePanels
              availableLists={realColumns}
              boardId={boardId}
              bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
              isMultiSelectMode={isMultiSelectMode}
              isPersonalWorkspace={isPersonalWorkspace}
              canUseBoardAssignees={canUseBoardAssignees}
              assigneeMemberSource={assigneeMemberSource}
              labels={deadlineLabels}
              onClearSelection={onClearSelection}
              onSectionCollapsedChange={onDeadlineSectionCollapsedChange}
              onTaskSelect={onTaskSelect}
              onUpdate={onUpdate}
              optimisticUpdateInProgress={optimisticUpdateInProgress}
              sections={deadlineSections}
              loading={deadlineSectionsLoading}
              collapsedSections={deadlineSectionsCollapsed}
              deadlineNow={deadlineNow}
              pinnedSections={{
                overdue: specialTaskListPins?.overdue,
                upcoming: specialTaskListPins?.upcoming,
              }}
              stickyOffsets={{
                overdue: pinnedSpecialListLayout.offsets['deadline:overdue'],
                upcoming: pinnedSpecialListLayout.offsets['deadline:upcoming'],
              }}
              onSectionPinnedChange={(section, pinned) =>
                onSpecialTaskListPinnedChange?.(section, pinned)
              }
              selectedTasks={selectedTasks}
              taskLists={columns}
              workspaceId={workspaceId}
            />
          )}

          {columns.map((list) => {
            // Filter tasks for this list
            let listTasks = tasks.filter((task) => task.list_id === list.id);

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
                return compareTasksByEffectiveSortKey(a, b);
              }

              return 0;
            });

            return (
              <BoardColumn
                key={list.id}
                column={list}
                boardId={boardId ?? ''}
                tasks={listTasks}
                availableLists={realColumns}
                isPersonalWorkspace={isPersonalWorkspace}
                canUseBoardAssignees={canUseBoardAssignees}
                assigneeMemberSource={assigneeMemberSource}
                onUpdate={onUpdate}
                onAddTask={() =>
                  boardId && createTask(boardId, list.id, realColumns, filters)
                }
                selectedTasks={selectedTasks}
                isMultiSelectMode={isMultiSelectMode}
                setIsMultiSelectMode={setIsMultiSelectMode}
                onTaskSelect={onTaskSelect}
                onClearSelection={onClearSelection}
                dragPreviewPosition={dragPreviewPosition}
                suppressTaskTransforms={suppressTaskTransforms}
                taskHeightsRef={taskHeightsRef}
                optimisticUpdateInProgress={optimisticUpdateInProgress}
                filters={filters}
                bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
                workspaceId={workspaceId}
                wsId={workspaceId}
                onExternalTasksCollapsedChange={onExternalTasksCollapsedChange}
                onTaskListCollapsedChange={onTaskListCollapsedChange}
                specialStickyOffset={
                  pinnedSpecialListLayout.offsets[`column:${list.id}`]
                }
                specialPinned={
                  list.is_external_staging
                    ? specialTaskListPins?.external_tasks === true
                    : list.status === 'closed'
                      ? specialTaskListPins?.closed_tasks === true
                      : false
                }
                onSpecialPinnedChange={(pinned) => {
                  if (list.is_external_staging) {
                    onSpecialTaskListPinnedChange?.('external_tasks', pinned);
                    return;
                  }

                  if (list.status === 'closed') {
                    onSpecialTaskListPinnedChange?.('closed_tasks', pinned);
                  }
                }}
                onHoverTaskList={
                  list.is_external_staging ? undefined : onHoveredTaskListChange
                }
                readOnly={readOnly}
              />
            );
          })}
          {!readOnly && (
            <TaskListForm boardId={boardId ?? ''} onListCreated={onUpdate} />
          )}
        </div>
      </SortableContext>

      {/* Overlay for collaborator cursors (gated on tier — free workspaces don't get board cursors) */}
      {!isPersonalWorkspace && boardId && cursorsEnabled && (
        <CursorOverlayMultiWrapper
          channelName={getBoardRealtimeChannelName(boardId)}
          containerRef={boardRef}
          cursorScope={{ boardId, type: 'board' }}
          listStatusFilter={listStatusFilter}
          filters={filters}
        />
      )}
    </div>
  );
}
