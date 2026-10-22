import VerifyTokenPage from '@tuturuuu/satellite/verify-token-page';
import { TaskDialogWrapper } from '@tuturuuu/tasks-ui/tu-do/shared/task-dialog-wrapper';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { SatelliteWorkspaceInvitationCard } from '../../../../packages/satellite/src/components/workspace-invitation/workspace-invitation-card';
import CalendarLabClientPage from '../app/[locale]/(dashboard)/[wsId]/lab/client';
import { CalendarPageView } from './calendar-page-view';
import type { CalendarPageModel } from './page-model.server';
import { TaskPageView } from './task-page-view';
import { WorkspaceView } from './workspace-view';

export function PageView({ model }: { model: CalendarPageModel }) {
  switch (model.kind) {
    case 'verify-token':
      return <VerifyTokenPage />;
    case 'invitation':
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/"
          invitation={model.invitation}
          workspaceHref={`/${model.invitation.workspace.id}`}
        />
      );
    case 'calendar':
      return (
        <WorkspaceView model={model.shell} locale={model.locale}>
          <CalendarPageView model={model.calendar} />
        </WorkspaceView>
      );
    case 'lab':
      return (
        <WorkspaceView model={model.shell} locale={model.locale}>
          <TaskDialogWrapper
            wsId={model.lab.workspace.id}
            isPersonalWorkspace={model.lab.personal}
          >
            <CalendarSyncProvider
              wsId={model.lab.workspace.id}
              experimentalGoogleToken={model.lab.googleToken}
              initialCalendarConnections={model.lab.calendarConnections}
            >
              <div className="flex h-[calc(100vh-2rem)] w-full flex-col">
                <CalendarLabClientPage {...model.lab} />
              </div>
            </CalendarSyncProvider>
          </TaskDialogWrapper>
        </WorkspaceView>
      );
    case 'task':
      return (
        <WorkspaceView model={model.shell} locale={model.locale}>
          <TaskDialogWrapper
            wsId={model.shell.workspace.id}
            isPersonalWorkspace={!!model.shell.workspace.personal}
          >
            <TaskPageView model={model.task} />
          </TaskDialogWrapper>
        </WorkspaceView>
      );
  }
}
