import VerifyTokenPage from '@tuturuuu/satellite/verify-token-page';
import { SatelliteWorkspaceInvitationCard } from '@tuturuuu/satellite/workspace-invitation/card';
import { BoardClient } from '@tuturuuu/tasks-ui/tu-do/shared/board-client';
import { SkeletonCard, SkeletonList } from '@tuturuuu/ui/skeleton';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, Suspense } from 'react';
import {
  CyclePlanningView,
  PublicTaskBoardContent,
  SharedTaskContent,
  TaskCalendarPageShell,
  TaskCyclesView,
  TaskLegacyRouteRecovery,
  TaskPlanComposer,
  TaskProgressPage,
} from './lazy-pages';
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

/** Holds a lazily loaded page's place while its chunk downloads. */
function PageChunk({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<SkeletonList className="p-2" rows={6} withTrailing />}>
      {children}
    </Suspense>
  );
}

function WorkspacePageView({ page }: { page: WorkspacePage }) {
  return page.kind === 'board' || page.kind === 'new-task' ? (
    <WorkspacePageContent page={page} />
  ) : (
    <PageChunk>
      <WorkspacePageContent page={page} />
    </PageChunk>
  );
}

function WorkspacePageContent({ page }: { page: WorkspacePage }) {
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
          key={`${page.currentUserId}:${page.workspace.id}:${page.boardId}`}
          boardId={page.boardId}
          initialBoard={page.board}
          initialListPages={page.listPages}
          initialPreferences={page.preferences}
          initialSnapshotAt={page.snapshotAt}
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
    case 'cycle-planning':
      return (
        <CyclePlanningView
          wsId={page.wsId}
          currentUserId={page.userId}
          cycles={page.cycles}
        />
      );
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
        <Suspense fallback={<SkeletonCard className="m-2" lines={4} />}>
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
        <WorkspaceView
          key={`${model.actorId}:${page.shell.workspace.id}`}
          model={page.shell}
        >
          <WorkspacePageView page={page.page} />
        </WorkspaceView>
      );
    case 'public-board':
      return (
        <PageChunk>
          <PublicTaskBoardContent payload={page.payload} />
        </PageChunk>
      );
    case 'public-board-missing':
      return <PublicBoardMissing />;
    case 'shared-task':
      return (
        <PageChunk>
          <SharedTaskContent
            response={page.response}
            shareCode={page.shareCode}
            currentUser={page.currentUser}
          />
        </PageChunk>
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
