import { HydrationBoundary } from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import { EnhancedBoardsView } from '@tuturuuu/tasks-ui/tu-do/boards/enhanced-boards-view';
import { TaskBoardForm } from '@tuturuuu/tasks-ui/tu-do/boards/form';
import { QuickCreateBoardDialog } from '@tuturuuu/tasks-ui/tu-do/boards/quick-create-board-dialog';
import MyTasksContent from '@tuturuuu/tasks-ui/tu-do/my-tasks/my-tasks-content';
import { BoardClient } from '@tuturuuu/tasks-ui/tu-do/shared/board-client';
import { TaskLegacyRouteRecovery } from '@tuturuuu/tasks-ui/tu-do/shared/task-legacy-route-recovery';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { TaskPageModel } from './task-page-model';

export function TaskPageView({ model }: { model: TaskPageModel }) {
  const t = useTranslations();
  switch (model.kind) {
    case 'tasks':
      return (
        <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6">
          <MyTasksContent
            embedded
            wsId={model.wsId}
            userId={model.userId}
            isPersonal={model.personal}
          />
        </div>
      );
    case 'task-detail':
      return (
        <TaskLegacyRouteRecovery
          routePrefix="/tasks"
          taskId={model.taskId}
          workspaceId={model.wsId}
        />
      );
    case 'board':
      return (
        <BoardClient
          boardId={model.boardId}
          initialBoard={model.board}
          workspace={model.workspace}
          workspaceTier={model.workspace.tier ?? null}
          currentUserId={model.userId}
          defaultView="kanban"
          routePrefix="/tasks"
          rootLoading
        />
      );
    case 'boards':
      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h1 className="font-bold text-2xl tracking-tight">
                {t('ws-task-boards.plural')}
              </h1>
              <p className="text-muted-foreground">
                {t('ws-task-boards.description')}
              </p>
            </div>
            <TaskBoardForm wsId={model.wsId}>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t('ws-task-boards.create')}
              </Button>
            </TaskBoardForm>
          </div>
          <HydrationBoundary state={model.state}>
            <QuickCreateBoardDialog
              wsId={model.wsId}
              openWhenEmpty={model.openWhenEmpty}
            />
            <EnhancedBoardsView wsId={model.wsId} />
          </HydrationBoundary>
        </div>
      );
  }
}
