import VerifyTokenPage from '@tuturuuu/satellite/verify-token-page';
import { SatelliteWorkspaceInvitationCard } from '@tuturuuu/satellite/workspace-invitation/card';
import { TaskCalendarPageShell } from '@tuturuuu/tasks-ui/calendar/task-calendar-page-shell';
import { TaskProgressPage } from '@tuturuuu/tasks-ui/progress/task-progress-page';
import { TaskCyclesView } from '@tuturuuu/tasks-ui/tu-do/cycles/task-cycles-view';
import { BoardClient } from '@tuturuuu/tasks-ui/tu-do/shared/board-client';
import { TaskLegacyRouteRecovery } from '@tuturuuu/tasks-ui/tu-do/shared/task-legacy-route-recovery';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import SharedTaskContent from '../app/[locale]/shared/task/[shareCode]/content';
import PublicTaskBoardContent from '../app/[locale]/shared/task-boards/[code]/content';
import { TaskPlanComposer } from '../components/task-plan-composer';
import type { TasksPage, TasksPageModel } from './page-model.server';
import { WorkspaceView } from './workspace-view';

type WorkspacePage = Extract<TasksPage, { kind: 'workspace' }>['page'];

function SharedMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-2 font-semibold text-2xl text-dynamic-red">
          {title}
        </h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function PublicBoardMissing() {
  const t = useTranslations('ws-task-boards.public');
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg space-y-3 text-center">
        <h1 className="font-semibold text-3xl">{t('unavailable_title')}</h1>
        <p className="text-muted-foreground">{t('unavailable_description')}</p>
      </div>
    </main>
  );
}

function WorkspacePageView({ page }: { page: WorkspacePage }) {
  const locale = useLocale();
  switch (page.kind) {
    case 'progress':
      return (
        <TaskProgressPage
          routeWsId={page.routeWsId}
          view={page.view}
          wsId={page.routeWsId}
        />
      );
    case 'board':
      return (
        <BoardClient
          boardId={page.boardId}
          initialBoard={page.board}
          workspace={page.workspace}
          workspaceTier={page.workspace.tier ?? null}
          currentUserId={page.currentUserId}
          defaultView="kanban"
          routePrefix=""
          rootLoading
        />
      );
    case 'calendar':
      return (
        <TaskCalendarPageShell
          className="h-[calc(100dvh-2rem)]"
          manageTaskDialog={false}
          calendarConnections={page.calendarConnections}
          enableSmartScheduling
          experimentalGoogleToken={page.googleToken}
          isPersonalWorkspace={!!page.workspace.personal}
          locale={locale}
          smartSchedulingTasks={page.smartSchedulingTasks}
          userId={page.userId}
          workspace={page.workspace}
        />
      );
    case 'cycles':
      return <TaskCyclesView wsId={page.wsId} initialCycles={page.cycles} />;
    case 'task-detail':
      return (
        <TaskLegacyRouteRecovery
          routePrefix=""
          taskId={page.taskId}
          workspaceId={page.wsId}
        />
      );
    case 'new-task':
      return (
        <Suspense fallback={<div className="h-40 animate-pulse bg-muted" />}>
          <TaskPlanComposer
            key={`${page.wsId}:${page.sourceUrl ?? ''}`}
            wsId={page.wsId}
            routeWsId={page.routeWsId}
            sourceUrl={page.sourceUrl}
          />
        </Suspense>
      );
  }
}

export function PageView({ model }: { model: TasksPageModel }) {
  const { page } = model;
  switch (page.kind) {
    case 'verify-token':
      return <VerifyTokenPage />;
    case 'invitation':
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/"
          invitation={page.invitation}
          workspaceHref={`/${page.invitation.workspace.id}`}
        />
      );
    case 'workspace':
      return (
        <WorkspaceView model={page.shell}>
          <WorkspacePageView page={page.page} />
        </WorkspaceView>
      );
    case 'public-board':
      return <PublicTaskBoardContent payload={page.payload} />;
    case 'public-board-missing':
      return <PublicBoardMissing />;
    case 'shared-task':
      return (
        <SharedTaskContent
          response={page.response}
          shareCode={page.shareCode}
          currentUser={page.currentUser}
        />
      );
    case 'shared-task-missing':
      return (
        <SharedMessage
          title="Share link not found"
          body="This share link may have been revoked or doesn't exist."
        />
      );
    case 'shared-task-error':
      return (
        <SharedMessage
          title="Error loading task"
          body="Failed to load task data. Please try again later."
        />
      );
    case 'link-preview':
      return null;
  }
}
