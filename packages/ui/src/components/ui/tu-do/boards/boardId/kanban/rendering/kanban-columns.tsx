'use client';

import {
  horizontalListSortingStrategy,
  SortableContext,
} from '@dnd-kit/sortable';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ListStatusFilter } from '../../../../shared/board-header';
import CursorOverlayMultiWrapper from '../../../../shared/cursor-overlay-multi-wrapper';
import { BoardColumn } from '../../board-column';
import type { TaskFilters } from '../../task-filter';
import { TaskListForm } from '../../task-list-form';
import { MAX_SAFE_INTEGER_SORT } from '../kanban-constants';

interface KanbanColumnsProps {
  columns: TaskList[];
  tasks: Task[];
  boardId: string;
  workspaceId: string;
  isPersonalWorkspace: boolean;
  cursorsEnabled?: boolean;
  disableSort: boolean;
  selectedTasks: Set<string>;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  onClearSelection: () => void;
  onUpdate: () => void;
  createTask: (
    boardId: string,
    listId: string,
    columns: TaskList[],
    filters?: TaskFilters
  ) => void;
  dragPreviewPosition: any;
  taskHeightsRef: React.MutableRefObject<Map<string, number>>;
  optimisticUpdateInProgress: Set<string>;
  filters?: TaskFilters;
  listStatusFilter?: ListStatusFilter;
  bulkUpdateCustomDueDate: (date: Date | null) => Promise<void>;
  boardRef: React.RefObject<HTMLDivElement | null>;
  columnsId: string[];
}

export function KanbanColumns({
  columns,
  tasks,
  boardId,
  workspaceId,
  isPersonalWorkspace,
  cursorsEnabled = true,
  disableSort,
  selectedTasks,
  isMultiSelectMode,
  setIsMultiSelectMode,
  onTaskSelect,
  onClearSelection,
  onUpdate,
  createTask,
  dragPreviewPosition,
  taskHeightsRef,
  optimisticUpdateInProgress,
  filters,
  listStatusFilter,
  bulkUpdateCustomDueDate,
  boardRef,
  columnsId,
}: KanbanColumnsProps) {
  return (
    <div
      ref={boardRef}
      className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent relative flex h-full w-full gap-2 overflow-x-auto"
    >
      <SortableContext
        items={columnsId}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex h-full gap-2 p-2">
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
                statusOrder[a.status as keyof typeof statusOrder] ?? 999;
              const statusB =
                statusOrder[b.status as keyof typeof statusOrder] ?? 999;
              if (statusA !== statusB) return statusA - statusB;
              return a.position - b.position;
            })
            .map((list) => {
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
                  isPersonalWorkspace={isPersonalWorkspace}
                  onUpdate={onUpdate}
                  onAddTask={() =>
                    boardId && createTask(boardId, list.id, columns, filters)
                  }
                  selectedTasks={selectedTasks}
                  isMultiSelectMode={isMultiSelectMode}
                  setIsMultiSelectMode={setIsMultiSelectMode}
                  onTaskSelect={onTaskSelect}
                  onClearSelection={onClearSelection}
                  dragPreviewPosition={
                    dragPreviewPosition?.listId === String(list.id)
                      ? dragPreviewPosition
                      : null
                  }
                  taskHeightsRef={taskHeightsRef}
                  optimisticUpdateInProgress={optimisticUpdateInProgress}
                  filters={filters}
                  bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
                  wsId={workspaceId}
                />
              );
            })}
          <TaskListForm boardId={boardId ?? ''} onListCreated={onUpdate} />
        </div>
      </SortableContext>

      {/* Overlay for collaborator cursors (gated on tier — free workspaces don't get board cursors) */}
      {!isPersonalWorkspace && boardId && cursorsEnabled && (
        <CursorOverlayMultiWrapper
          channelName={`board-cursor-${boardId}`}
          containerRef={boardRef}
          listStatusFilter={listStatusFilter}
          filters={filters}
        />
      )}
    </div>
  );
}
