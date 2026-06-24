import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { TaskDialogWrapper } from '@tuturuuu/ui/tu-do/shared/task-dialog-wrapper';
import type { ExtendedWorkspaceTask } from '../time-tracker/types';
import { CalendarClientPage } from './calendar-client-page';
import TasksSidebar from './components/tasks-sidebar';

interface CalendarPageShellProps {
  calendarConnections: CalendarConnection[] | null;
  enableSmartScheduling: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleTokenClient | null;
  isPersonalWorkspace: boolean;
  locale: string;
  smartSchedulingTasks?: ExtendedWorkspaceTask[];
  userId: string;
  workspace: Workspace;
}

export function CalendarPageShell({
  calendarConnections,
  enableSmartScheduling,
  experimentalGoogleToken,
  isPersonalWorkspace,
  locale,
  smartSchedulingTasks = [],
  userId,
  workspace,
}: CalendarPageShellProps) {
  return (
    <TaskDialogWrapper
      isPersonalWorkspace={isPersonalWorkspace}
      wsId={workspace.id}
    >
      <CalendarSyncProvider
        wsId={workspace.id}
        experimentalGoogleToken={experimentalGoogleToken}
        initialCalendarConnections={calendarConnections || []}
      >
        <div className="flex h-[calc(100vh-2rem)]">
          <CalendarClientPage
            experimentalGoogleToken={experimentalGoogleToken}
            workspace={workspace}
            enableSmartScheduling={enableSmartScheduling}
          />
          {enableSmartScheduling && (
            <TasksSidebar
              resolvedWsId={workspace.id}
              locale={locale}
              userId={userId}
              tasks={smartSchedulingTasks}
            />
          )}
        </div>
      </CalendarSyncProvider>
    </TaskDialogWrapper>
  );
}

export default CalendarPageShell;
