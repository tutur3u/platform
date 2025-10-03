'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import { useEffect, useMemo, useState } from 'react';
import { KanbanBoard } from '../boards/boardId/kanban';
import { StatusGroupedBoard } from '../boards/boardId/status-grouped-board';
import type { TaskFilters } from '../boards/boardId/task-filter';
import { TimelineBoard } from '../boards/boardId/timeline-board';
import { BoardHeader, type ListStatusFilter } from '../shared/board-header';
import { ListView } from '../shared/list-view';
import { TaskEditDialog } from '../shared/task-edit-dialog';

export type ViewType = 'kanban' | 'status-grouped' | 'list' | 'timeline';

interface Props {
  workspace: Workspace;
  board: TaskBoard;
  tasks: Task[];
  lists: TaskList[];
  workspaceLabels: WorkspaceLabel[];
  currentUserId?: string;
}

export function BoardViews({
  workspace,
  board,
  tasks,
  lists,
  currentUserId,
}: Props) {
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [filters, setFilters] = useState<TaskFilters>({
    labels: [],
    assignees: [],
    projects: [],
    priorities: [],
    dueDateRange: null,
    estimationRange: null,
    includeMyTasks: false,
  });
  const [listStatusFilter, setListStatusFilter] =
    useState<ListStatusFilter>('active');
  // Local per-session optimistic overrides (e.g., timeline resize) so switching views preserves changes
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Filter lists based on selected status filter
  const filteredLists = useMemo(() => {
    if (listStatusFilter === 'all') {
      return lists;
    }
    return lists.filter((list) => list.status === listStatusFilter);
  }, [lists, listStatusFilter]);

  // Filter tasks based on filters AND filtered lists
  const filteredTasks = useMemo(() => {
    // First, filter by list status
    const listIds = new Set(filteredLists.map((list) => list.id));
    let result = tasks.filter((task) => listIds.has(task.list_id));

    // Filter by labels
    if (filters.labels.length > 0) {
      result = result.filter((task) => {
        if (!task.labels || task.labels.length === 0) return false;
        return filters.labels.some((selectedLabel) =>
          task.labels?.some((taskLabel) => taskLabel.id === selectedLabel.id)
        );
      });
    }

    // Filter by assignees or "my tasks"
    if (filters.includeMyTasks && currentUserId) {
      result = result.filter((task) =>
        task.assignees?.some((a) => a.id === currentUserId)
      );
    } else if (filters.assignees.length > 0) {
      result = result.filter((task) =>
        task.assignees?.some((a) =>
          filters.assignees.some((fa) => fa.id === a.id)
        )
      );
    }

    // Filter by projects
    if (filters.projects.length > 0) {
      result = result.filter((task) => {
        // Check if task has projects relationship
        if (!task.projects || task.projects.length === 0) return false;
        return task.projects.some((pt: any) =>
          filters.projects.some((p) => p.id === pt.id)
        );
      });
    }

    // Filter by priorities
    if (filters.priorities.length > 0) {
      result = result.filter((task) =>
        task.priority ? filters.priorities.includes(task.priority) : false
      );
    }

    // Filter by due date range
    if (filters.dueDateRange?.from) {
      result = result.filter((task) => {
        if (!task.end_date) return false;
        const taskDate = new Date(task.end_date);
        const fromDate = filters.dueDateRange!.from!;
        const toDate = filters.dueDateRange!.to;
        return taskDate >= fromDate && (!toDate || taskDate <= toDate);
      });
    }

    return result;
  }, [tasks, filters, filteredLists, currentUserId]);

  // Apply optimistic overrides so views receive up-to-date edits (durations, name, dates) even before refetch.
  const effectiveTasks = useMemo(() => {
    if (!Object.keys(taskOverrides).length) return filteredTasks;
    return filteredTasks.map((t) => {
      const o = taskOverrides[t.id];
      return o ? ({ ...t, ...o } as Task) : t;
    });
  }, [filteredTasks, taskOverrides]);

  const handleTaskPartialUpdate = (taskId: string, partial: Partial<Task>) => {
    setTaskOverrides((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), ...partial },
    }));
  };

  const handleUpdate = async () => {
    // Refresh both tasks and lists
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks', board.id] }),
      queryClient.invalidateQueries({ queryKey: ['task_lists', board.id] }),
    ]);
  };

  // Global keyboard shortcuts for all views
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

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
        setCreateDialogOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderView = () => {
    switch (currentView) {
      case 'status-grouped':
        return (
          <StatusGroupedBoard
            lists={filteredLists}
            tasks={effectiveTasks}
            boardId={board.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
            isPersonalWorkspace={workspace.personal}
          />
        );
      case 'kanban':
        return (
          <KanbanBoard
            workspace={workspace}
            boardId={board.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            isLoading={false}
          />
        );
      case 'list':
        return (
          <ListView
            boardId={board.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            isPersonalWorkspace={workspace.personal}
          />
        );
      case 'timeline':
        return (
          <TimelineBoard
            tasks={effectiveTasks}
            lists={filteredLists}
            onTaskPartialUpdate={handleTaskPartialUpdate}
          />
        );
      default:
        return (
          <StatusGroupedBoard
            lists={filteredLists}
            tasks={effectiveTasks}
            boardId={board.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
            isPersonalWorkspace={workspace.personal}
          />
        );
    }
  };

  return (
    <div className="-m-2 md:-mx-4 flex h-[calc(100vh-1rem)] flex-1 flex-col">
      <BoardHeader
        board={board}
        tasks={tasks}
        lists={lists}
        currentView={currentView}
        currentUserId={currentUserId}
        onViewChange={setCurrentView}
        filters={filters}
        onFiltersChange={setFilters}
        listStatusFilter={listStatusFilter}
        onListStatusFilterChange={setListStatusFilter}
      />
      <div className="h-full overflow-hidden">{renderView()}</div>

      {/* Global task creation dialog */}
      <TaskEditDialog
        boardId={board.id}
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onUpdate={handleUpdate}
        availableLists={filteredLists}
        mode="create"
      />
    </div>
  );
}
