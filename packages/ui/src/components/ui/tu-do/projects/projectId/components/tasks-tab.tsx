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
import { useTasksHref } from '@tuturuuu/ui/tu-do/tasks-route-context';
import { useTranslations } from 'next-intl';

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

  const virtualBoard: Pick<
    WorkspaceTaskBoard,
    'id' | 'name' | 'ws_id' | 'ticket_prefix' | 'archived_at'
  > = {
    id: projectId,
    name: projectName,
    ws_id: wsId,
    ticket_prefix: null,
    archived_at: null,
  };

  const renderView = () => {
    switch (currentView) {
      case 'kanban':
        return (
          <KanbanBoard
            workspace={workspace}
            boardId={projectBoardId}
            tasks={tasks}
            lists={lists}
            isLoading={false}
            isMultiSelectMode={isMultiSelectMode}
            setIsMultiSelectMode={setIsMultiSelectMode}
          />
        );
      case 'list':
        return (
          <ListView
            boardId={projectBoardId}
            tasks={tasks}
            lists={lists}
            isPersonalWorkspace={workspace.personal}
          />
        );
      case 'timeline':
        return (
          <TimelineBoard
            tasks={tasks}
            lists={lists}
            onTaskPartialUpdate={onTaskPartialUpdate}
          />
        );
      default:
        return (
          <KanbanBoard
            workspace={workspace}
            boardId={projectBoardId}
            tasks={tasks}
            lists={lists}
            isLoading={false}
            isMultiSelectMode={isMultiSelectMode}
            setIsMultiSelectMode={setIsMultiSelectMode}
          />
        );
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Target className="h-16 w-16 text-muted-foreground/50" />
        <div>
          <p className="mb-2 font-semibold text-lg">{t('no_tasks_title')}</p>
          <p className="text-muted-foreground text-sm">
            {t('no_tasks_description')}
          </p>
        </div>
        <Button
          onClick={() => setShowLinkTaskDialog(true)}
          className="bg-linear-to-r from-dynamic-blue to-dynamic-purple shadow-lg transition-all hover:shadow-xl"
        >
          <Link2 className="mr-2 h-4 w-4" />
          {t('link_tasks')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-3">
        <div className="flex-1">
          <BoardHeader
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
          size="sm"
          className="border-dynamic-purple/30 transition-all hover:border-dynamic-purple/50 hover:bg-dynamic-purple/10"
        >
          <Link2 className="mr-2 h-4 w-4" />
          {t('link_tasks')}
        </Button>
      </div>
      <div className="h-full overflow-hidden">{renderView()}</div>
    </div>
  );
}
