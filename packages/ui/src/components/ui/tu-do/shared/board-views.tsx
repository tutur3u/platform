'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSemanticTaskSearch } from '../../../../hooks/use-semantic-task-search';
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
    includeUnassigned: false,
  });
  const [listStatusFilter, setListStatusFilter] =
    useState<ListStatusFilter>('all');
  // Local per-session optimistic overrides (e.g., timeline resize) so switching views preserves changes
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Semantic search hook
  const {
    data: semanticSearchResults = [],
    isLoading: isSearchLoading,
    isFetching: isSearchFetching,
  } = useSemanticTaskSearch({
    wsId: workspace.id,
    query: filters.searchQuery || '',
    matchThreshold: 0.3,
    matchCount: 50,
    enabled: !!filters.searchQuery && filters.searchQuery.trim().length > 0,
  });

  // Filter lists based on selected status filter
  const filteredLists = useMemo(() => {
    if (listStatusFilter === 'all') {
      return lists;
    }
    return lists.filter((list) => list.status === listStatusFilter);
  }, [lists, listStatusFilter]);

  // Helper function to apply non-search filters
  const applyNonSearchFilters = useCallback(
    (tasksToFilter: Task[]) => {
      let result = tasksToFilter;

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

      // Filter by unassigned
      if (filters.includeUnassigned) {
        result = result.filter(
          (task) => !task.assignees || task.assignees.length === 0
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
    },
    [filters, currentUserId]
  );

  // Filter tasks based on filters AND filtered lists
  const filteredTasks = useMemo(() => {
    // First, filter by list status
    const listIds = new Set(filteredLists.map((list) => list.id));
    let result = tasks.filter((task) => listIds.has(task.list_id));

    // If there's a search query, use semantic search results
    if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
      // Create a map of task IDs to their search ranking
      const searchRankMap = new Map(
        semanticSearchResults.map((result, index) => [result.id, index])
      );

      // Filter to only include semantic search results
      result = result.filter((task) => searchRankMap.has(task.id));

      // Sort by search relevance (lower index = higher relevance)
      result.sort((a, b) => {
        const rankA = searchRankMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rankB = searchRankMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return rankA - rankB;
      });
    }

    // Apply other filters (labels, assignees, projects, priorities, due date)
    return applyNonSearchFilters(result);
  }, [
    tasks,
    filters,
    filteredLists,
    semanticSearchResults,
    applyNonSearchFilters,
  ]);

  // Apply optimistic overrides so views receive up-to-date edits (durations, name, dates) even before refetch.
  const effectiveTasks = useMemo(() => {
    let tasks = filteredTasks;

    // Apply overrides
    if (Object.keys(taskOverrides).length) {
      tasks = tasks.map((t) => {
        const o = taskOverrides[t.id];
        return o ? ({ ...t, ...o } as Task) : t;
      });
    }

    // Apply sorting
    if (filters.sortBy) {
      const sorted = [...tasks];
      switch (filters.sortBy) {
        case 'name-asc':
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'name-desc':
          sorted.sort((a, b) => b.name.localeCompare(a.name));
          break;
        case 'priority-high': {
          const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
          sorted.sort((a, b) => {
            const priorityA = a.priority
              ? priorityOrder[a.priority]
              : Number.MAX_SAFE_INTEGER;
            const priorityB = b.priority
              ? priorityOrder[b.priority]
              : Number.MAX_SAFE_INTEGER;
            return priorityA - priorityB;
          });
          break;
        }
        case 'priority-low': {
          const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
          sorted.sort((a, b) => {
            const priorityA = a.priority
              ? priorityOrder[a.priority]
              : Number.MAX_SAFE_INTEGER;
            const priorityB = b.priority
              ? priorityOrder[b.priority]
              : Number.MAX_SAFE_INTEGER;
            return priorityB - priorityA;
          });
          break;
        }
        case 'due-date-asc':
          sorted.sort((a, b) => {
            if (!a.end_date && !b.end_date) return 0;
            if (!a.end_date) return 1;
            if (!b.end_date) return -1;
            return (
              new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
            );
          });
          break;
        case 'due-date-desc':
          sorted.sort((a, b) => {
            if (!a.end_date && !b.end_date) return 0;
            if (!a.end_date) return -1;
            if (!b.end_date) return 1;
            return (
              new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
            );
          });
          break;
        case 'created-date-desc':
          sorted.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
          break;
        case 'created-date-asc':
          sorted.sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          );
          break;
        case 'estimation-high':
          sorted.sort((a, b) => {
            const estA = a.estimation_points ?? Number.MIN_SAFE_INTEGER;
            const estB = b.estimation_points ?? Number.MIN_SAFE_INTEGER;
            return estB - estA;
          });
          break;
        case 'estimation-low':
          sorted.sort((a, b) => {
            const estA = a.estimation_points ?? Number.MAX_SAFE_INTEGER;
            const estB = b.estimation_points ?? Number.MAX_SAFE_INTEGER;
            return estA - estB;
          });
          break;
      }
      return sorted;
    }

    return tasks;
  }, [filteredTasks, taskOverrides, filters.sortBy]);

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

  // Auto-set list status filter to 'all' when in status-grouped view
  useEffect(() => {
    if (currentView === 'status-grouped' && listStatusFilter !== 'all') {
      setListStatusFilter('all');
    }
  }, [currentView, listStatusFilter]);

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
            searchQuery={filters.searchQuery}
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
        currentUserId={currentUserId}
        currentView={currentView}
        onViewChange={setCurrentView}
        filters={filters}
        onFiltersChange={setFilters}
        listStatusFilter={listStatusFilter}
        onListStatusFilterChange={setListStatusFilter}
        isPersonalWorkspace={workspace.personal}
        isSearching={isSearchLoading || isSearchFetching}
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
