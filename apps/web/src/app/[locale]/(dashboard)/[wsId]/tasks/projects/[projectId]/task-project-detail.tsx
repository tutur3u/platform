'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { KanbanBoard } from '@tuturuuu/ui/tu-do/boards/boardId/kanban';
import { StatusGroupedBoard } from '@tuturuuu/ui/tu-do/boards/boardId/status-grouped-board';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import { TimelineBoard } from '@tuturuuu/ui/tu-do/boards/boardId/timeline-board';
import {
  BoardHeader,
  type ListStatusFilter,
} from '@tuturuuu/ui/tu-do/shared/board-header';
import { ListView } from '@tuturuuu/ui/tu-do/shared/list-view';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import { useMemo, useState } from 'react';

export type ViewType = 'kanban' | 'status-grouped' | 'list' | 'timeline';

interface TaskProjectDetailProps {
  workspace: Workspace;
  project: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    creator?: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  };
  tasks: Task[];
  lists: TaskList[];
  workspaceLabels: WorkspaceLabel[];
  currentUserId: string;
  wsId: string;
}

export function TaskProjectDetail({
  workspace,
  project,
  tasks,
  lists,
  workspaceLabels,
  currentUserId,
  wsId,
}: TaskProjectDetailProps) {
  const queryClient = useQueryClient();
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
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});

  // Filter lists based on selected status filter
  const filteredLists = useMemo(() => {
    if (listStatusFilter === 'all') {
      return lists;
    }
    return lists.filter((list) => list.status === listStatusFilter);
  }, [lists, listStatusFilter]);

  // Filter tasks based on filters AND filtered lists
  const filteredTasks = useMemo(() => {
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

  // Apply optimistic overrides
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
    // Refresh tasks for this project
    await queryClient.invalidateQueries({
      queryKey: ['workspace', wsId, 'task-projects', project.id],
    });
  };

  // Create virtual board object for BoardHeader
  const virtualBoard = {
    id: project.id,
    name: project.name,
  };

  const renderView = () => {
    switch (currentView) {
      case 'status-grouped':
        return (
          <StatusGroupedBoard
            lists={filteredLists}
            tasks={effectiveTasks}
            boardId={project.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
            isPersonalWorkspace={workspace.personal}
          />
        );
      case 'kanban':
        // Use null boardId to prevent useBoardConfig from querying workspace_boards
        return (
          <KanbanBoard
            workspace={workspace}
            boardId={null as any}
            tasks={effectiveTasks}
            lists={filteredLists}
            isLoading={false}
          />
        );
      case 'list':
        return (
          <ListView
            boardId={project.id}
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
            boardId={project.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
            isPersonalWorkspace={workspace.personal}
          />
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Board Views with Filters */}
      {tasks.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <p className="text-muted-foreground">
            No tasks linked to this project yet.
          </p>
          <p className="text-muted-foreground text-sm">
            Go back to the projects list to link tasks.
          </p>
        </div>
      ) : (
        <div className="-m-2 md:-mx-4 flex h-[calc(100vh-1rem)] flex-1 flex-col">
          <BoardHeader
            board={virtualBoard as any}
            tasks={tasks}
            lists={lists}
            currentView={currentView}
            currentUserId={currentUserId}
            onViewChange={setCurrentView}
            filters={filters}
            onFiltersChange={setFilters}
            listStatusFilter={listStatusFilter}
            onListStatusFilterChange={setListStatusFilter}
            backUrl={`/${wsId}/tasks/projects`}
            hideActions={true}
          />
          <div className="h-full overflow-hidden">{renderView()}</div>
        </div>
      )}
    </div>
  );
}
