'use client';

import { Link2, Target } from '@tuturuuu/icons';
import type { Workspace, WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { KanbanBoard } from '@tuturuuu/ui/tu-do/boards/boardId/kanban';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import { TimelineBoard } from '@tuturuuu/ui/tu-do/boards/boardId/timeline-board';
import {
  BoardHeader,
  type ListStatusFilter,
} from '@tuturuuu/ui/tu-do/shared/board-header';
import type { ViewType } from '@tuturuuu/ui/tu-do/shared/board-views';
import { ListView } from '@tuturuuu/ui/tu-do/shared/list-view';
import {
  ProgressiveLoaderProvider,
  type ProgressiveLoaderValue,
} from '@tuturuuu/ui/tu-do/shared/progressive-loader-context';
import { useTasksHref } from '@tuturuuu/ui/tu-do/tasks-route-context';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

interface TasksTabProps {
  workspace: Workspace;
  wsId: string;
  projectId: string;
  projectName: string;
  tasks: Task[];
  lists: TaskList[];
  currentUserId: string;
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  filters: TaskFilters;
  setFilters: (filters: TaskFilters) => void;
  listStatusFilter: ListStatusFilter;
  setListStatusFilter: (filter: ListStatusFilter) => void;
  setShowLinkTaskDialog: (show: boolean) => void;
  onTaskPartialUpdate: (taskId: string, partial: Partial<Task>) => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (mode: boolean) => void;
}

export function TasksTab({
  workspace,
  wsId,
  projectId,
  projectName,
  tasks,
  lists,
  currentUserId,
  currentView,
  setCurrentView,
  filters,
  setFilters,
  listStatusFilter,
  setListStatusFilter,
  setShowLinkTaskDialog,
  onTaskPartialUpdate,
  isMultiSelectMode,
  setIsMultiSelectMode,
}: TasksTabProps) {
  const t = useTranslations('task_project_detail.tasks_tab');
  const tasksHref = useTasksHref();
  const projectBoardId = `project:${projectId}`;

  const progressiveLoader = useMemo<ProgressiveLoaderValue>(() => {
    const tasksByList = tasks.reduce(
      (acc, task) => {
        const listTasks = acc[task.list_id] ?? [];
        listTasks.push(task);
        acc[task.list_id] = listTasks;
        return acc;
      },
      {} as Record<string, Task[]>
    );

    return {
      pagination: lists.reduce(
        (acc, list) => {
          const listTasks = tasksByList[list.id] ?? [];
          acc[list.id] = {
            page: 0,
            hasMore: false,
            totalCount: listTasks.length,
            isLoading: false,
            isInitialLoad: false,
          };
          return acc;
        },
        {} as ProgressiveLoaderValue['pagination']
      ),
      loadListPage: async (listId) => {
        const listTasks = tasksByList[listId] ?? [];
        return {
          tasks: listTasks,
          totalCount: listTasks.length,
          hasMore: false,
        };
      },
      revalidateLoadedLists: async () => {
        return;
      },
    };
  }, [lists, tasks]);

  const virtualBoard: Pick<
    WorkspaceTaskBoard,
    'id' | 'name' | 'ws_id' | 'ticket_prefix' | 'archived_at'
  > = {
    id: projectId,
    name: projectName,
    ws_id: workspace.id,
    ticket_prefix: null,
    archived_at: null,
  };

  const renderView = () => {
    switch (currentView) {
      case 'kanban':
        return (
          <KanbanBoard
            workspace={workspace}
            workspaceId={workspace.id}
            boardId={projectBoardId}
            tasks={tasks}
            lists={lists}
            isLoading={false}
            disableSort={!!filters.sortBy}
            listStatusFilter={listStatusFilter}
            filters={filters}
            isMultiSelectMode={isMultiSelectMode}
            setIsMultiSelectMode={setIsMultiSelectMode}
          />
        );
      case 'list':
        return (
          <ListView
            workspaceId={workspace.id}
            boardId={projectBoardId}
            tasks={tasks}
            lists={lists}
            isPersonalWorkspace={workspace.personal}
            preserveTaskOrder={!!filters.sortBy}
            searchQuery={filters.searchQuery}
          />
        );
      case 'timeline':
        return (
          <TimelineBoard
            wsId={workspace.id}
            boardId={projectBoardId}
            tasks={tasks}
            lists={lists}
            onTaskPartialUpdate={onTaskPartialUpdate}
          />
        );
      default:
        return (
          <KanbanBoard
            workspace={workspace}
            workspaceId={workspace.id}
            boardId={projectBoardId}
            tasks={tasks}
            lists={lists}
            isLoading={false}
            disableSort={!!filters.sortBy}
            listStatusFilter={listStatusFilter}
            filters={filters}
            isMultiSelectMode={isMultiSelectMode}
            setIsMultiSelectMode={setIsMultiSelectMode}
          />
        );
    }
  };

  if (tasks.length === 0) {
    return (
      <ProjectTasksEmptyState
        onLinkTasks={() => setShowLinkTaskDialog(true)}
        description={t('no_tasks_description')}
        linkTasksLabel={t('link_tasks')}
        title={t('no_tasks_title')}
      />
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="task-project-tasks-tab"
    >
      <div
        className="flex shrink-0 items-start gap-2 bg-background"
        data-testid="task-project-tasks-header"
      >
        <div className="min-w-0 flex-1">
          <BoardHeader
            workspaceId={wsId}
            board={virtualBoard}
            currentView={currentView}
            currentUserId={currentUserId}
            onViewChange={setCurrentView}
            filters={filters}
            onFiltersChange={setFilters}
            listStatusFilter={listStatusFilter}
            onListStatusFilterChange={setListStatusFilter}
            isPersonalWorkspace={workspace.personal}
            backUrl={`/${wsId}${tasksHref('/projects')}`}
            hideActions={true}
            isMultiSelectMode={isMultiSelectMode}
            setIsMultiSelectMode={setIsMultiSelectMode}
          />
        </div>
        <Button
          onClick={() => setShowLinkTaskDialog(true)}
          variant="outline"
          size="xs"
          className="mt-2 mr-2 shrink-0 gap-2"
        >
          <Link2 className="h-3.5 w-3.5" />
          {t('link_tasks')}
        </Button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden"
        data-testid="task-project-tasks-view"
      >
        <ProgressiveLoaderProvider value={progressiveLoader}>
          {renderView()}
        </ProgressiveLoaderProvider>
      </div>
    </div>
  );
}

interface ProjectTasksEmptyStateProps {
  title: string;
  description: string;
  linkTasksLabel: string;
  onLinkTasks: () => void;
}

function ProjectTasksEmptyState({
  title,
  description,
  linkTasksLabel,
  onLinkTasks,
}: ProjectTasksEmptyStateProps) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-8 text-center">
      <Target className="h-14 w-14 text-muted-foreground/50" />
      <div>
        <p className="mb-2 font-semibold text-lg">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Button onClick={onLinkTasks}>
        <Link2 className="mr-2 h-4 w-4" />
        {linkTasksLabel}
      </Button>
    </div>
  );
}
